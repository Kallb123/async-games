import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IRaceCarsGameData } from "@/games/RaceCars/RaceCarsModels";
import {
    gearName,
    MIN_MOVE_ROWS,
    RaceCarsGear,
    RaceCarsTrack,
    trackById,
} from "@/games/RaceCars/board";
import {
    derivePath,
    legalGears,
    moveOptions,
    recomputeRoundOrder,
    resolveArrival,
    rollFor,
    IRaceCarsPlayerState,
    IRaceCarsSpecificGameState,
    RaceCarsArrival,
} from "@/games/RaceCars/rules";
import { mongoMap } from "@/utils/games/mongoMaps";
import { playerHistory } from "@/utils/games/history";
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
// PR 5 adds the third command — `RaceCarsSlipstream`, and with it the
// `phase: 'slipstream'` hand-off `RaceCarsMove` does not yet make — along with
// §4.1's ending. PR 7 adds oil and its `recordedOilRolls`.

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

function cornerName(track: RaceCarsTrack, cornerId: string): string {
    return track.corners.find(corner => corner.id === cornerId)?.name ?? 'the corner';
}

/**
 * What arriving cost and banked, as history clauses in the order it happened —
 * `resolveArrival`'s own event list read back in the player's language (§10).
 *
 * No clause claims a tyre. An overshoot the car could not pay charges nothing
 * at all (§10: you pay nothing, and the car spins), so the events alone cannot
 * say what was spent — the caller totals it from the pools instead, which is
 * the one reading that is true of every path through here.
 */
function arrivalClauses(track: RaceCarsTrack, arrival: RaceCarsArrival): string[] {
    const clauses: string[] = [];
    for (const event of arrival.events) {
        switch (event.type) {
            case 'blocked':
                clauses.push('was blocked and had to lift');
                break;
            case 'boxedIn':
                clauses.push('was boxed in and stayed put');
                break;
            case 'cornerStop':
                clauses.push(`banked a stop in ${cornerName(track, event.cornerId)} (${event.banked} of ${event.owed})`);
                break;
            case 'cornerCleared':
                clauses.push(`cleared ${cornerName(track, event.cornerId)}`);
                break;
            case 'overshoot':
                clauses.push(event.waived
                    ? `left ${cornerName(track, event.cornerId)} as slowly as the road allows`
                    : `overshot ${cornerName(track, event.cornerId)} by ${pluralize(event.rows, 'row')}`);
                break;
            case 'lap':
                clauses.push(`completed ${pluralize(event.lapsCompleted, 'lap')}`);
                break;
            case 'finish':
                clauses.push('crossed the line');
                break;
            case 'spin':
                clauses.push(`spun back to row ${arrival.row} and misses their next turn`);
                break;
            // 'oilCheck' says nothing on its own — the spin it may cause is the
            // event worth a line, and oil arrives in PR 7 with the rest of §14.
        }
    }
    return clauses;
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
    /** Brake points spent to shorten this roll, one row each (§11). */
    brake: number = 0;
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
            || this.brake > ps.roll - MIN_MOVE_ROWS) return INVALID;

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

        const track = trackById(gs.trackId);
        const path = derivePath(gs, this.senderId, options.distance, { row: this.row, lane: this.lane });
        if (path.length === 0) return INVALID;

        const tyresBefore = ps.tyres;
        const arrival = resolveArrival(gs, this.senderId, path, { blockedShort: options.blockedShort });

        ps.brakes -= this.brake;
        ps.brakeSpent = this.brake;
        ps.row = arrival.row;
        ps.lane = arrival.lane;
        ps.lapsCompleted = arrival.lapsCompleted;
        ps.tyres = arrival.tyres;
        ps.cornerStops = arrival.cornerStops;
        ps.gear = arrival.gear;
        // §13 step 4. The flag is consumed by `CheckEndTurn` above when the
        // round reaches them; the slick a spin lays (step 5) arrives with the
        // rest of oil in PR 7, and §4.1's ending — `finishedPosition`, the
        // classification and `finishGame` — in PR 5, which is why
        // `arrival.finished` moves the car and does not yet end the race.
        if (arrival.spun) ps.skipNextTurn = true;

        const rows = path.length - 1;
        const braked = this.brake > 0 ? ` after braking ${pluralize(this.brake, 'row')} off the roll` : '';
        const tyresSpent = tyresBefore - arrival.tyres;
        const clauses = [
            ...(rows > 0 ? [`drove ${pluralize(rows, 'row')} to row ${path[rows].row}${braked}`] : []),
            ...arrivalClauses(track, arrival),
        ];
        const cost = tyresSpent > 0 ? ` — ${pluralize(tyresSpent, 'tyre')}` : '';
        data.gameState.history.unshift(playerHistory(this.senderId, `${clauses.join(', ')}${cost}`));

        // §12's tow is the one thing that can still happen this turn, and it
        // arrives in PR 5 with the command that takes it. Until then a move is
        // the end of a turn: handing off to a `slipstream` phase no command can
        // answer would strand the driver — and every driver after them, since
        // `currentTurn` would never move.
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
