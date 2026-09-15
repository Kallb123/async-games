import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IRaceCarsGameData } from "@/games/RaceCars/RaceCarsModels";
import {
    cornerAt,
    gearName,
    RaceCarsTrack,
    MIN_MOVE_STEPS,
    RaceCarsGear,
    RaceCarsSpace,
    SLIPSTREAM_STEPS,
    trackById,
    BRAKE_SLICK_THRESHOLD,
    SLICK_CAP,
    SLICK_LIFETIME_ROUNDS,
    spaceKey,
} from "@/games/RaceCars/board";
import {
    classification,
    derivePath,
    legalGears,
    moveOptions,
    recomputeRoundOrder,
    resolveArrival,
    rollFor,
    slipstreamOffered,
    IRaceCarsPlayerState,
    IRaceCarsSpecificGameState,
    RaceCarsArrival,
    IRaceCarsSlick,
} from "@/games/RaceCars/rules";
import { arrivalClauses, RaceCarsArrivalSummary } from "@/games/RaceCars/narration";
import { mongoMap } from "@/utils/games/mongoMaps";
import { playerHistory, userToken } from "@/utils/games/history";
import { pluralize } from "@/utils/ui/text";

// ═══════════════════════════════════════════════════════════════════════════
//  RACE CARS
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/race-cars.md §23.7. PR 2 added the game type and a skeleton
// shift; PR 3 makes the game drivable — §7's first two steps as two commands,
// and the round bookkeeping that hands the turn on.
//
// Both commands validate through rules.ts rather than re-deriving reachability
// or corner state a second time (§23.4): `legalGears` decides a shift,
// `moveOptions` decides where a move may finish, and `resolveArrival` settles
// the corners it crossed. Nothing in this file knows what a corner is.
//
// PR 5 adds the third command — `RaceCarsSlipstream`, the `phase: 'slipstream'`
// hand-off `RaceCarsMove` makes when a tow is on offer, and §4.1's ending. PR 7
// adds oil and its `recordedOilRolls`.

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

/**
 * The car of the driver whose turn it actually is, or null.
 *
 * `currentTurn` alone is not proof of whose turn it is (§23.4). Two shared
 * surfaces write it along `gameState.turnOrder` with no idea what game they
 * are in — `POST /api/game/taketurn` and the turn-timer cron's `noAdapter`
 * branch — and `turnOrder` is the join order the roster and the colour map key
 * on, deliberately *not* the race order. The race order is `roundOrder`, so
 * that is what a command is checked against: a driver acting out of race order
 * is refused even when `currentTurn` says otherwise.
 */
function driverOnTurn(gs: IRaceCarsSpecificGameState, userId: string): IRaceCarsPlayerState | null {
    if (gs.roundOrder[gs.roundIndex] !== userId) return null;
    return mongoMap(gs.players).get(userId) ?? null;
}

/**
 * What one leg of a turn resolved to, handed back on the outcome for the
 * end-of-move reveal (§23.7 PR 5) — the ICommandOutcome-extension pattern every
 * other game with per-command result data uses (see
 * IOutbreakInfectionPhaseOutcome). `outcome` is Execute's own return value and
 * never something deserialised from a request body, so there is nothing here
 * for a client to forge — and nothing worth persisting either, since replaying
 * the command recomputes it identically.
 */
export interface IRaceCarsArrivalOutcome extends ICommandOutcome {
    arrival: RaceCarsArrivalSummary & {
        lane: number;
        /**
         * The gear and number this leg was driven on, for the reveal — null on
         * §12's tow, which is a fixed three rows and no roll at all.
         *
         * Carried here rather than read off the car afterwards: a spin drops
         * the gear to neutral and being boxed in drops it to first, so by the
         * time the response lands, the car is no longer in the gear its number
         * was rolled in.
         */
        roll: { gear: RaceCarsGear; value: number } | null;
        /** Tyres this leg actually cost — totalled from the pool, never from the events (see arrivalClauses). */
        tyresSpent: number;
        /** §12's tow is on offer: the one decision left in this turn. */
        towOffered: boolean;
    };
}

/**
 * §4.1 and §4.2: the race ends the instant a car crosses, and the whole field
 * is classified by where it stood at that moment.
 *
 * Written once, for everyone, here — there is no later round to change
 * anybody's place, because the crossing stopped the race. `complete` is what
 * `CheckGameOver` reads back, which is what makes `runCommand` report the game
 * over and the command route call `finishGame` with `endReason: 'win'`.
 * `currentTurn` is cleared for the same reason every other game's CheckGameOver
 * clears it: a replay never reaches `finishGame`.
 */
function takeTheFlag(data: IRaceCarsGameData, winnerId: string): void {
    const gs = data.specificGameState;
    const players = mongoMap(gs.players);
    const order = classification(gs, winnerId);
    order.forEach((userId, index) => {
        const ps = players.get(userId);
        if (ps) ps.finishedPosition = index + 1;
    });

    data.complete = true;
    data.winner = winnerId;
    data.currentTurn = '';

    data.gameState.history.unshift(playerHistory(winnerId, 'takes the chequered flag'));
    // §4.2 is what makes finishing fourth instead of sixth worth driving for,
    // so the order the race was classified in is written down where a driver
    // who is not the winner can read it.
    if (order.length > 1) {
        data.gameState.history.unshift({
            text: `Classified: ${order.map((userId, index) => `P${index + 1} ${userToken(userId)}`).join(', ')}`,
        });
    }
}

/**
 * Where a move ended, for the history log: the corner it finished inside, or
 * nothing at all on open road.
 *
 * A row number used to stand here ("drove 8 rows to row 42"), and it cannot any
 * more: a row is a rank round the lap rather than a place a driver could point
 * at (§5.1), so the corner is the landmark and the space count is the distance.
 */
function landing(track: RaceCarsTrack, path: RaceCarsSpace[]): string {
    const end = path[path.length - 1];
    const corner = cornerAt(track, end.row, end.lane);
    return corner ? ` into ${corner.name}` : '';
}

/**
 * Settle one leg of a turn: resolve the path the driver chose, write what it
 * decided onto their car, log it, and — if it crossed the line — end the race.
 *
 * §12's tow is "a move, not a bonus" (§23.4), so `RaceCarsSlipstream` is this
 * same call with the distance fixed at three. Corners, overshoots, spins, laps
 * and the finish are resolved once, here, and neither command class knows what
 * a corner is.
 */
function settle(
    data: IRaceCarsGameData,
    ps: IRaceCarsPlayerState,
    senderId: string,
    path: RaceCarsSpace[],
    leg: { blockedShort: boolean; waiveUnavoidableCorner?: boolean; lead: string },
): { arrival: RaceCarsArrival; tyresSpent: number } {
    const gs = data.specificGameState;
    const track = trackById(gs.trackId);
    const tyresBefore = ps.tyres;

    const arrival = resolveArrival(gs, senderId, path, {
        blockedShort: leg.blockedShort,
        waiveUnavoidableCorner: leg.waiveUnavoidableCorner,
    });

    ps.row = arrival.row;
    ps.lane = arrival.lane;
    ps.lapsCompleted = arrival.lapsCompleted;
    ps.tyres = arrival.tyres;
    ps.cornerStops = arrival.cornerStops;
    ps.gear = arrival.gear;
    // §13 step 4. The flag is consumed by `CheckEndTurn` when the round reaches
    // them; the slick a spin lays (step 5) is handled below.
    if (arrival.spun) ps.skipNextTurn = true;

    const tyresSpent = tyresBefore - arrival.tyres;
    const clauses = [leg.lead, ...arrivalClauses(track, arrival)].filter(clause => clause.length > 0);
    const cost = tyresSpent > 0 ? ` — ${pluralize(tyresSpent, 'tyre')}` : '';
    data.gameState.history.unshift(playerHistory(senderId, `${clauses.join(', ')}${cost}`));

    // After the line that says how they got there, so the log reads in order.
    if (arrival.finished) takeTheFlag(data, senderId);

    // §14: lay a slick if oil is on and the conditions are met.
    if (gs.oilSpills) {
        const slickSpace = 
            // A spin (from overshoot or oil check) lays a slick where it came to rest.
            arrival.slick ??
            // Spending 3 or more brakes lays a slick at the final space.
            (ps.brakeSpent >= BRAKE_SLICK_THRESHOLD ? { row: arrival.row, lane: arrival.lane } : null);

        if (slickSpace) {
            const key = spaceKey(slickSpace.row, slickSpace.lane);
            const existingSlick = gs.slicks.find(s => spaceKey(s.row, s.lane) === key);

            if (existingSlick) {
                // A slick laid where one already exists refreshes the existing one.
                existingSlick.laidOnRound = gs.round;
            } else {
                // Lay a new slick. If we're at the cap, remove the oldest one.
                if (gs.slicks.length >= SLICK_CAP) {
                    // Find and remove the oldest slick (lowest laidOnRound, ties broken by order).
                    const oldestIndex = gs.slicks.findIndex(s => 
                        s.laidOnRound === Math.min(...gs.slicks.map(sl => sl.laidOnRound))
                    );
                    if (oldestIndex >= 0) {
                        gs.slicks.splice(oldestIndex, 1);
                    }
                }
                gs.slicks.push({ row: slickSpace.row, lane: slickSpace.lane, laidOnRound: gs.round });
            }
        }
    }

    return { arrival, tyresSpent };
}

/**
 * The outcome one leg of a turn hands back, and whether the turn is over.
 *
 * §12's offer is the gate in both directions (§23.4), so it is re-derived here
 * from the board the leg left behind rather than read off anything the client
 * sent — and a crossing beats it, because the race has already stopped.
 */
function arrivalOutcome(
    gs: IRaceCarsSpecificGameState,
    ps: IRaceCarsPlayerState,
    senderId: string,
    settled: { arrival: RaceCarsArrival; tyresSpent: number },
    leg: { roll: { gear: RaceCarsGear; value: number } | null; offerTow: boolean },
): IRaceCarsArrivalOutcome {
    const { arrival, tyresSpent } = settled;
    // §12: one tow per turn, so only the rolled move can earn one — and a
    // crossing beats even that, because the race has already stopped.
    const towOffered = leg.offerTow && !arrival.finished && slipstreamOffered(gs, senderId);
    if (towOffered) ps.phase = 'slipstream';
    return {
        validMove: true,
        turnOver: !towOffered,
        arrival: {
            events: arrival.events,
            row: arrival.row,
            lane: arrival.lane,
            roll: leg.roll,
            spun: arrival.spun,
            finished: arrival.finished,
            tyresSpent,
            towOffered,
        },
    };
}

@serializable
export class RaceCarsGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "RaceCars";
    friendlyName: string = "Race Cars";
    icon: string = "";
    url: string = "racecars";
    readonly className: string = "RaceCarsGameType";

    /**
     * Hand the turn to the next driver in the race order (§15) — which is
     * `roundOrder`/`roundIndex` and never a step along `turnOrder`, because
     * `turnOrder` is the join order every shared surface keys on (§23.2).
     */
    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        if (!commandOutcome.turnOver) return;
        const data = gameData as IRaceCarsGameData;
        const gs = data.specificGameState;
        if (gs.roundOrder.length === 0) return;
        const players = mongoMap(gs.players);

        // A run of spun drivers unwinds in one pass: each pass either consumes
        // a `skipNextTurn` — a flag no driver holds twice, and consumed at the
        // moment of skipping — or stops. The bound is therefore the field plus
        // the driver who just moved, who may have spun into a skip of their
        // own, and it is written down rather than left implicit because a
        // `while` here that ever failed to consume would hang the request.
        for (let pass = 0; pass <= gs.roundOrder.length; pass++) {
            gs.roundIndex += 1;
            if (gs.roundIndex >= gs.roundOrder.length) {
                // §15: the order is a fixed fact about a round, recomputed in
                // this one place and rebuilt whole at index 0 — never spliced
                // mid-round, which would leave `roundIndex` pointing past the
                // end and `currentTurn` pointing at nobody.
                //
                // One increment per wrap, and a wrap this loop reaches twice
                // counts twice: a round every driver sat out is still a round
                // that elapsed — each of them consumed their slot in it, and
                // said so in the log. Counting it once instead would leave the
                // counter disagreeing with its own "sat out the round" lines,
                // and would hold §14's slicks on the road a round longer than
                // the traffic they were laid for.
                
                // §14: sweep slicks laid SLICK_LIFETIME_ROUNDS ago. A slick
                // laid during round r is swept at the end of round r+1, so when
                // we're incrementing to the next round, we sweep slicks from
                // (current round - 1 - SLICK_LIFETIME_ROUNDS).
                const sweepRound = gs.round - SLICK_LIFETIME_ROUNDS;
                if (gs.oilSpills && sweepRound >= 1) {
                    gs.slicks = gs.slicks.filter(slick => slick.laidOnRound > sweepRound);
                }

                gs.round += 1;
                gs.roundOrder = recomputeRoundOrder(gs);
                gs.roundIndex = 0;
            }
            const nextId = gs.roundOrder[gs.roundIndex];
            const next = players.get(nextId);
            if (!next?.skipNextTurn) break;
            next.skipNextTurn = false;
            // §13: missing a turn is automatic and silent — the driver is
            // skipped rather than prompted. The log is where they find out,
            // which is where they would have found out anyway.
            data.gameState.history.unshift(playerHistory(nextId, 'sat out the round after spinning'));
        }

        const driverId = gs.roundOrder[gs.roundIndex];
        data.currentTurn = driverId;

        // The incoming driver's turn starts at §7 step 1, with nothing banked
        // from the last one. Forgetting this clause is the bug turnTimeout.ts
        // records this repo shipping once already on Banned Islet's
        // `actionsLeft`; here it would lock out every driver after the first,
        // whose `phase` is still 'move' from a turn they finished and whose
        // shift `RaceCarsShift` would therefore refuse forever.
        const driver = players.get(driverId);
        if (driver) {
            driver.phase = 'shift';
            driver.roll = null;
            driver.brakeSpent = 0;
        }
    }

    /**
     * The flag the winning command already set — never a re-derivation.
     *
     * §4.1's win is an event in play order rather than a state the board
     * settles into, so deriving it here would hand the race to whoever was
     * furthest along instead of to whoever crossed first. And it must not be a
     * method that does nothing either: `runCommand` reports `gameOver: true`
     * only when this returns truthy, and only that makes the command route
     * call `finishGame` — so a no-op would leave a game with a `winner` and
     * `complete: false`, still taking turns.
     *
     * Nothing sets `complete` yet: crossing the line ends the race in PR 5,
     * which is where this is tested.
     */
    CheckGameOver(gameData: IGameData): boolean {
        return gameData.complete;
    }
}

// ─── RaceCarsShift (§7 step 1, §8) ──────────────────────────────────────────

@serializable
export class RaceCarsShift implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    /** The gear being declared, validated against §8.2 by `legalGears`. */
    gear: RaceCarsGear = 0;
    /**
     * The gear's die, for replay. Named `recorded…` so
     * `stripRecordedRandomness` deletes it off a live request — without which
     * a driver posts `{"gear":5,"recordedRoll":20}` and picks their own dice
     * (§23.4). `Execute` writes the value it used back here before
     * `runCommand` pushes the command into `commandHistory`, so a replay
     * reproduces the number the live race rolled.
     */
    recordedRoll?: number;
    readonly className = 'RaceCarsShift';

    myString() {
        return `took ${gearName(this.gear)}`;
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IRaceCarsGameData;
        const gs = data.specificGameState;
        const ps = driverOnTurn(gs, this.senderId);
        if (!ps) return INVALID;

        // `phase` is the authority and `roll` follows it (§23.4), and both are
        // checked: this command returns `turnOver: false`, so `currentTurn`
        // never moves, and without the `roll === null` half a driver re-sends
        // the same body until the d20 comes up 20 — every gate on the command
        // route still passing each time.
        if (ps.phase !== 'shift' || ps.roll !== null) return INVALID;

        const option = legalGears(gs, this.senderId).find(gearOption => gearOption.gear === this.gear);
        if (!option) return INVALID;

        const from = ps.gear;
        ps.gearbox -= option.gearboxCost;
        ps.gear = this.gear;

        // The die is thrown here and revealed in the same breath (§23.4):
        // there is never a moment when a resolved roll exists that its owner
        // has not been told, and never an unspent roll sitting in state.
        const roll = this.recordedRoll ?? rollFor(this.gear);
        this.recordedRoll = roll;
        ps.roll = roll;
        ps.phase = 'move';

        const shift = this.gear > from ? `took ${gearName(this.gear)}`
            : this.gear < from ? `dropped to ${gearName(this.gear)}${option.gearboxCost > 0 ? ` — ${option.gearboxCost} gearbox` : ''}`
            : `held ${gearName(this.gear)}`;
        data.gameState.history.unshift(playerHistory(this.senderId, `${shift} and rolled a ${roll}`));

        // §7: the roll happens in step 1 and the destination is chosen with the
        // number known, so the turn is only half over.
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── RaceCarsMove (§7 step 2, §9-§11) ───────────────────────────────────────

@serializable
export class RaceCarsMove implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    /** Where the move finishes — a destination, never a path (§9, §23.3). */
    row: number = -1;
    lane: number = -1;
    /** Brake points spent to shorten this roll, one space each (§11). */
    brake: number = 0;
    /**
     * One d6 per slick entered, for replay. Named `recorded…` so
     * `stripRecordedRandomness` deletes it off a live request — without which
     * a driver posts `{"row":10,"lane":1,"recordedOilRolls":[1,4]}` and picks
     * their own dice (§23.4). `Execute` writes the values it used back here
     * before `runCommand` pushes the command into `commandHistory`, so a replay
     * reproduces the numbers the live race rolled.
     */
    recordedOilRolls?: number[];
    readonly className = 'RaceCarsMove';

    myString() {
        return 'drove';
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IRaceCarsGameData;
        const gs = data.specificGameState;
        const ps = driverOnTurn(gs, this.senderId);
        if (!ps) return INVALID;
        if (ps.phase !== 'move' || ps.roll === null) return INVALID;

        // §11's brake spend, bounded in all three directions: a negative brake
        // would buy extra rows *and* extra tokens, a brake past the pool would
        // spend what isn't there, and a car always moves at least one row.
        if (!Number.isInteger(this.brake)
            || this.brake < 0
            || this.brake > ps.brakes
            || this.brake > ps.roll - MIN_MOVE_STEPS) return INVALID;

        // The distance comes from the persisted roll and the validated brake,
        // never from the command — and the destination is checked for
        // membership in the server's own set rather than used to derive a path
        // (§23.4). Deriving a path *to* a submitted destination accepts
        // `{ row: 77, lane: 1 }` and wins the race from the grid; lane 3 on a
        // two-lane row, lane 0 and a fractional row are all refused here too.
        //
        // Exactly one set, whichever of §9's three cases this is: the
        // blocked-short landings are their own, so "I would rather stop here"
        // cannot be dressed as a block.
        const options = moveOptions(gs, this.senderId, ps.roll - this.brake);
        if (!options.spaces.some(space => space.row === this.row && space.lane === this.lane)) return INVALID;

        const path = derivePath(gs, this.senderId, options.distance, { row: this.row, lane: this.lane });
        if (path.length === 0) return INVALID;

        ps.brakes -= this.brake;
        ps.brakeSpent = this.brake;

        const track = trackById(gs.trackId);
        // Spaces, not rows: a roll is spent in spaces and a row is a rank round
        // the lap rather than a distance (§5.1), so "eight spaces" is the one
        // number the driver and the log can both read off the board.
        const spaces = path.length - 1;
        const braked = this.brake > 0 ? ` after braking ${pluralize(this.brake, 'space')} off the roll` : '';
        // Read before the arrival is applied: a spin drops the gear to neutral.
        const roll = { gear: ps.gear, value: ps.roll };
        const settled = settle(data, ps, this.senderId, path, {
            blockedShort: options.blockedShort,
            lead: spaces > 0 ? `drove ${pluralize(spaces, 'space')}${landing(track, path)}${braked}` : '',
        });

        // Store the oil rolls back into the command for replay (§23.4).
        this.recordedOilRolls = settled.arrival.oilRolls;

        // §12: a move that ends one or two rows behind another car is owed a
        // tow, and the turn is not over until the driver has taken it or
        // declined it. Everything else — a spin, a crossing, an empty road —
        // ends the turn here.
        return arrivalOutcome(gs, ps, this.senderId, settled, { roll, offerTow: true });
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── RaceCarsSlipstream (§7 step 3, §12) ────────────────────────────────────

@serializable
export class RaceCarsSlipstream implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    /**
     * Where the tow finishes, or `null` to decline it.
     *
     * One field rather than a `decline` flag beside `row`/`lane` (§23.4): a
     * declined tow would otherwise post coordinates that mean nothing, and a
     * command whose fields can be meaningless is a command whose validation has
     * a case nobody writes. Whatever arrives here is checked for membership in
     * the server's own three-row reach set, so a forged row, a fractional one
     * and a lane that does not exist all fail the same way.
     */
    tow: RaceCarsSpace | null = null;
    /**
     * One d6 per slick entered, for replay. Named `recorded…` so
     * `stripRecordedRandomness` deletes it off a live request (§23.4).
     * `Execute` writes the values it used back here before `runCommand` pushes
     * the command into `commandHistory`, so a replay reproduces the numbers
     * the live race rolled.
     */
    recordedOilRolls?: number[];
    readonly className = 'RaceCarsSlipstream';

    myString() {
        return this.tow === null ? 'waved the tow away' : 'took the tow';
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IRaceCarsGameData;
        const gs = data.specificGameState;
        const ps = driverOnTurn(gs, this.senderId);
        if (!ps) return INVALID;
        if (ps.phase !== 'slipstream') return INVALID;

        // The offer is the gate in both directions (§23.4). Re-derived here
        // rather than trusted from the phase: three free rows claimed by a
        // driver who earned no tow is the whole of what this command could be
        // abused for, and a `decline` flag cannot be trusted to decide anything
        // — not least because `"false"` is truthy.
        if (!slipstreamOffered(gs, this.senderId)) return INVALID;

        const tow = this.tow;
        if (tow === null || tow === undefined) {
            // §12: declining costs nothing, and it is a real choice — three
            // free rows in a braking zone are three rows of overshoot. The
            // phase is left where the turn got to; `CheckEndTurn` resets it
            // when the round comes back round to this driver, which is the one
            // place that reset lives (§23.7 PR 3).
            data.gameState.history.unshift(playerHistory(this.senderId, 'waved the tow away'));
            return { validMove: true, turnOver: true };
        }

        // Exactly the same reach the first move validated against, with the
        // distance fixed at three — and the blocked-short set is its own set
        // here too, so "I would rather stop here" cannot be dressed as a block.
        const options = moveOptions(gs, this.senderId, SLIPSTREAM_STEPS);
        if (!options.spaces.some(space => space.row === tow.row && space.lane === tow.lane)) return INVALID;

        const path = derivePath(gs, this.senderId, options.distance, { row: tow.row, lane: tow.lane });
        if (path.length === 0) return INVALID;

        const track = trackById(gs.trackId);
        const settled = settle(data, ps, this.senderId, path, {
            blockedShort: options.blockedShort,
            // §12: a tow can push a car out of a corner it still owes stops to,
            // and the overshoot is charged in full. §10's waiver forgives a
            // corner the driver "could not have avoided leaving"; declining
            // this costs nothing, so that reasoning does not reach the tow.
            waiveUnavoidableCorner: false,
            lead: `took the tow ${pluralize(path.length - 1, 'space')}${landing(track, path)}`,
        });

        // Store the oil rolls back into the command for replay (§23.4).
        this.recordedOilRolls = settled.arrival.oilRolls;

        // §12: one tow per turn. Ending it behind a third car earns nothing, so
        // no second offer is made and the turn is over either way.
        return arrivalOutcome(gs, ps, this.senderId, settled, { roll: null, offerTow: false });
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
