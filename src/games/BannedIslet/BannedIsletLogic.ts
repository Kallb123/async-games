import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IBannedIsletGameData, IBannedIsletPlayerState, IBannedIsletSpecificGameState } from "@/games/BannedIslet/BannedIsletModels";
import {
    ACTIONS_PER_TURN,
    CARDS_DRAWN_PER_TURN,
    CARDS_TO_CAPTURE,
    HAND_LIMIT,
    LOSING_WATER_LEVEL,
    PIER_TILE,
    BannedIsletCardId,
    BannedIsletTileId,
    cardName,
    isPlayableCard,
    isTreasureCard,
    tileName,
    treasureName,
} from "@/games/BannedIslet/board";
import {
    applyFloodCard,
    capturableTreasureAt,
    floodRateFor,
    isEscapeReady,
    isPierLoss,
    isWaterLevelLoss,
    lostTreasures,
    moveTargets,
    navigatorCanMoveOthers,
    navigatorMoveTargets,
    pilotFlightAvailable,
    flightTargets,
    liftOrigin,
    resolveSwim,
    sandbagsTargets,
    giveCardTargets,
    shoreUpTargets,
    shoreUpsPerAction,
    IBannedIsletFloodLogEntry,
    IBannedIsletPawn,
    IBannedIsletSwim,
} from "@/games/BannedIslet/rules";
import { playerHistory, userToken } from "@/utils/games/history";
import { shuffle } from "@/utils/games/shuffle";
import { pluralize } from "@/utils/ui/text";

// ═══════════════════════════════════════════════════════════════════════════
//  BANNED ISLET
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/banned-islet.md §21.6. PR 3 added the action phase: one
// parameterised BannedIsletAction covering all five verbs of §8, following
// §21.4's "four command classes, not fifteen", and every one of them decided
// by rules.ts rather than by re-deriving adjacency or capture eligibility
// here. PR 5 adds the two phases the players don't control — BannedIsletEndTurn
// (draw two, then flood) and BannedIsletDiscard (the hand limit that can hold
// a turn open between them) — which is what makes the game loseable, and so
// playable start to finish.
//
// PR 8 adds the last command, BannedIsletPlayCard, and with it the last
// clause of §4.1: the win is now an *action taken* rather than a state
// reached, because a Helicopter Lift has to be played to leave the island.

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

function playerState(gs: IBannedIsletSpecificGameState, userId: string): IBannedIsletPlayerState | undefined {
    return gs.players.get(userId);
}

/** Every pawn on the island, as the roster-reading rules of §12 want it. */
function pawnList(gs: IBannedIsletSpecificGameState): IBannedIsletPawn[] {
    return [...gs.players].map(([userId, ps]) => ({ userId, position: ps.position }));
}

// §8 Move: one step to an adjacent tile that is still there — and, for the
// Diver, a swim through any run of ruined tiles to the land beyond (§12).
// `moveTargets` is the same list the client's action picker offers and takes
// the same role, so a move the picker wouldn't draw is a move Execute won't
// take (docs/new-game.md, "Isomorphic rules modules").
function applyMove(gs: IBannedIsletSpecificGameState, ps: IBannedIsletPlayerState, target: number): string | null {
    if (!moveTargets(gs.positions, ps.position, ps.role).includes(target)) return null;
    const from = tileName(gs.positions[ps.position].tile);
    ps.position = target;
    return `moved from ${from} to ${tileName(gs.positions[target].tile)}`;
}

// §8 Shore Up: flip this tile or a neighbour from flooded back to dry — the
// only action in the game that gives ground back, and never one that un-sinks
// (§9.1). A dry target is illegal rather than a no-op (§16), which is exactly
// what `shoreUpTargets` listing only the flooded ones expresses.
//
// §12's two exceptions both land here: the Explorer's corners are inside
// `shoreUpTargets`, and the Engineer's second tile is `secondTarget` — one
// action, two tiles, and "up to two" so a lone flooded tile is still legal.
// Both targets are checked before either is dried, so a rejected second tile
// cannot leave the first one quietly dry on a command the pipeline discards.
function applyShoreUp(
    gs: IBannedIsletSpecificGameState,
    ps: IBannedIsletPlayerState,
    target: number,
    secondTarget: number,
): string | null {
    const targets = shoreUpTargets(gs.positions, ps.position, ps.role);
    if (!targets.includes(target)) return null;

    const second = secondTarget >= 0 ? secondTarget : null;
    if (second !== null) {
        if (shoreUpsPerAction(ps.role) < 2) return null;
        if (second === target || !targets.includes(second)) return null;
    }

    gs.positions[target].state = 'dry';
    if (second === null) return `shored up ${tileName(gs.positions[target].tile)}`;
    gs.positions[second].state = 'dry';
    return `shored up ${tileName(gs.positions[target].tile)} and ${tileName(gs.positions[second].tile)}`;
}

// §8 Give a Treasure Card: the game's only transfer, and a face-to-face one —
// both pawns on the same tile, unless the sender is §12's Messenger, who needs
// no meeting. `giveCardTargets` owns that distinction so this reads the same
// either way.
//
// Only a treasure card moves: §10's specials are played from their holder's
// own hand rather than traded, and Waters Rise! is never held at all.
function applyGiveCard(
    gs: IBannedIsletSpecificGameState,
    senderId: string,
    ps: IBannedIsletPlayerState,
    targetUserId: string | null,
    card: BannedIsletCardId | null,
): string | null {
    if (!targetUserId || targetUserId === senderId) return null;
    const target = playerState(gs, targetUserId);
    if (!target) return null;
    if (!giveCardTargets(pawnList(gs), senderId, ps.role).includes(targetUserId)) return null;
    if (!card || !isTreasureCard(card)) return null;

    const index = ps.hand.indexOf(card);
    if (index < 0) return null;

    ps.hand.splice(index, 1);
    target.hand.push(card);
    return `gave their ${cardName(card)} card to ${userToken(targetUserId)}`;
}

// §12 Pilot: once a turn, for one action, any tile on the island — the answer
// to §5.1's severed board and the one ability the game persists a flag for.
// `pilotFlightUsed` is cleared in CheckEndTurn, so the once is per own turn.
function applyPilotFlight(gs: IBannedIsletSpecificGameState, ps: IBannedIsletPlayerState, target: number): string | null {
    if (!pilotFlightAvailable(ps.role, ps.pilotFlightUsed)) return null;
    if (!flightTargets(gs.positions, ps.position).includes(target)) return null;

    const from = tileName(gs.positions[ps.position].tile);
    ps.position = target;
    ps.pilotFlightUsed = true;
    return `flew from ${from} to ${tileName(gs.positions[target].tile)}`;
}

// §12 Navigator: for one action, move another player up to two tiles — and
// §21.3's third deviation, which this is the whole of: the moved player is not
// asked. Co-op means no adversarial use, exactly the call Outbreak makes for
// Airlift, and the history line below is what makes sure they can see where
// they were put.
function applyNavigatorMove(
    gs: IBannedIsletSpecificGameState,
    senderId: string,
    ps: IBannedIsletPlayerState,
    targetUserId: string | null,
    target: number,
): string | null {
    if (!navigatorCanMoveOthers(ps.role)) return null;
    if (!targetUserId || targetUserId === senderId) return null;
    const moved = playerState(gs, targetUserId);
    if (!moved) return null;
    if (!navigatorMoveTargets(gs.positions, moved.position, moved.role).includes(target)) return null;

    const from = tileName(gs.positions[moved.position].tile);
    moved.position = target;
    return `sent ${userToken(targetUserId)} from ${from} to ${tileName(gs.positions[target].tile)}`;
}

// §8 Capture a Treasure: four matching cards, standing on either of that
// treasure's tiles. The treasure it claims is derived rather than named by the
// command — `capturableTreasureAt` already answers "which treasure, if any"
// for the action picker, so there is no second field for a client to disagree
// with. §8's discard happens as part of the action, which is why §16 can say a
// capture is free of hand-limit concerns.
function applyCapture(gs: IBannedIsletSpecificGameState, ps: IBannedIsletPlayerState): string | null {
    const treasure = capturableTreasureAt(gs.positions, ps.position, ps.hand, gs.treasures);
    if (!treasure) return null;

    for (let paid = 0; paid < CARDS_TO_CAPTURE; paid++) {
        ps.hand.splice(ps.hand.indexOf(treasure), 1);
        gs.treasureDiscard.push(treasure);
    }
    gs.treasures[treasure] = true;
    return `captured the ${treasureName(treasure)} at ${tileName(gs.positions[ps.position].tile)}`;
}

@serializable
export class BannedIsletGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "BannedIslet";
    friendlyName: string = "Banned Islet";
    icon: string = "";
    url: string = "bannedislet";
    readonly className: string = "BannedIsletGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        if (!commandOutcome.turnOver) return;
        const data = gameData as IBannedIsletGameData;
        const order = data.gameState.turnOrder;
        const next = order[(order.indexOf(data.currentTurn) + 1) % order.length];
        data.currentTurn = next;

        // §21.4: `actionsLeft` refills at the *start* of the new current
        // player's turn, not the end of the previous one — what lets a plan
        // cross from one player to the next without stalling on an exhausted
        // counter. The Pilot's once-a-turn flight (§12) resets the same way,
        // so PR 7 has nothing to add here.
        const nextPs = playerState(data.specificGameState, next);
        if (nextPs) {
            nextPs.actionsLeft = ACTIONS_PER_TURN;
            nextPs.pilotFlightUsed = false;
        }
    }

    CheckGameOver(gameData: IGameData): boolean {
        // Nothing is derived here, and that is §4.1: the win is *an action
        // taken, not a state reached*, so it fires inside BannedIsletPlayCard
        // the moment a Helicopter Lift is played on a ready island (see
        // endInEscape) rather than the moment the island becomes ready. §4.2's
        // four defeats are the same shape for a different reason — each can
        // only be spotted mid-resolution, inside the flood phase, so they end
        // the game there (endInTeamLoss).
        //
        // Both have therefore already set `complete` by the time the command
        // route asks, and re-deriving either here is what would quietly turn
        // the team's most memorable failure — everything done and no card in
        // hand — back into a win.
        return (gameData as IBannedIsletGameData).complete;
    }
}

// ─── BannedIsletAction ──────────────────────────────────────────────────────

/**
 * §8's action catalogue, plus §21.4's two role kinds — the two abilities of §12
 * that aren't one of the five verbs. The other four roles bend a verb that is
 * already here (the Explorer's diagonals, the Diver's swim, the Engineer's
 * second tile, the Messenger's reach) and so add no kind of their own.
 */
export type BannedIsletActionKind = 'move' | 'shoreUp' | 'giveCard' | 'capture' | 'pass' | 'pilotFlight' | 'navigatorMove';

@serializable
export class BannedIsletAction implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    kind: BannedIsletActionKind = 'pass';
    /** move / shoreUp / pilotFlight: the grid position to step onto, dry out or fly to. navigatorMove: where the other player's pawn lands. */
    target: number = -1;
    /**
     * shoreUp, and only for §12's Engineer: a second flooded tile dried by the
     * same action. -1 for everybody else, and for an Engineer drying just the
     * one — the ability is "up to two".
     */
    secondTarget: number = -1;
    /** giveCard: the teammate the card moves to. navigatorMove: whose pawn is being sent. */
    targetUserId: string | null = null;
    /** giveCard: which treasure card moves. A capture names no card — four of the tile's own is the only possible payment (§8). */
    cardId: BannedIsletCardId | null = null;
    readonly className = 'BannedIsletAction';

    // Player-facing summary for the turn-review scrubber (TurnNavControls),
    // shown next to the sender's name so it reads as "<name> · <this>". Built
    // from the command's own fields rather than the fuller history line
    // Execute writes, since those also name the tile the pawn came *from*,
    // which isn't knowable here.
    myString() {
        switch (this.kind) {
            case 'move': return 'moved';
            case 'shoreUp': return 'shored up a tile';
            case 'giveCard': return this.cardId ? `gave their ${cardName(this.cardId)} card to a teammate` : 'gave a card to a teammate';
            case 'capture': return 'captured a treasure';
            case 'pass': return 'passed';
            case 'pilotFlight': return 'flew across the island';
            case 'navigatorMove': return 'sent a teammate across the island';
            default: return 'took an action';
        }
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IBannedIsletGameData;
        const gs = data.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        // A turn held open for a hand-limit discard (§10) is not a turn that
        // can still act — the phase arrives with the draw, in PR 5.
        if (gs.phase !== 'actions') return INVALID;
        if (ps.actionsLeft <= 0) return INVALID;

        let historyLine: string | null;
        switch (this.kind) {
            case 'move':
                historyLine = applyMove(gs, ps, this.target);
                break;
            case 'shoreUp':
                historyLine = applyShoreUp(gs, ps, this.target, this.secondTarget);
                break;
            case 'giveCard':
                historyLine = applyGiveCard(gs, this.senderId, ps, this.targetUserId, this.cardId);
                break;
            case 'capture':
                historyLine = applyCapture(gs, ps);
                break;
            case 'pass':
                historyLine = `passed, forfeiting ${pluralize(ps.actionsLeft, 'action')}`;
                break;
            case 'pilotFlight':
                historyLine = applyPilotFlight(gs, ps, this.target);
                break;
            case 'navigatorMove':
                historyLine = applyNavigatorMove(gs, this.senderId, ps, this.targetUserId, this.target);
                break;
            default:
                historyLine = null;
        }
        if (historyLine === null) return INVALID;

        // §8: every action costs one of the three — except Pass, which
        // forfeits the *rest* of them rather than one, which is the one place
        // this catalogue differs from Outbreak's.
        ps.actionsLeft = this.kind === 'pass' ? 0 : ps.actionsLeft - 1;
        data.gameState.history.unshift(playerHistory(this.senderId, historyLine));

        // Never ends the turn itself, even on the third action (§21.4): only
        // BannedIsletEndTurn may, and it is the only command in the game that
        // touches a deck. Folding Phase 2 and Phase 3 in here would fire the
        // flood deck inside a plan that nothing accounted for (§21.5).
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  THE DRAW AND FLOOD PHASES (§7 Phases 2-3, §9-§11, §21.6 PR 5)
// ═══════════════════════════════════════════════════════════════════════════
//
// The island starts fighting back. BannedIsletEndTurn runs both phases the
// players don't control — draw two, then flood at the current rate — and
// BannedIsletDiscard closes a turn the draw left over the hand limit by
// running the flood phase that was waiting on it. §21.4: these are the only
// commands in the game that touch a deck, which is what keeps the route
// planner honest (§21.5 — a plan never draws and never floods).

/**
 * BannedIsletEndTurn/BannedIsletDiscard's outcome — whichever of them ran the
 * flood phase. The established ICommandOutcome-extension pattern (see
 * IOutbreakInfectionPhaseOutcome): `outcome` is Execute's own return value,
 * never something deserialised from a request body, so there is nothing here
 * for a client to forge and nothing worth persisting — replaying the same
 * command recomputes it identically.
 */
export interface IBannedIsletFloodPhaseOutcome extends ICommandOutcome {
    floodLog: IBannedIsletFloodLogEntry[];
}

function floodPhaseOutcome(turnOver: boolean, floodLog: IBannedIsletFloodLogEntry[]): IBannedIsletFloodPhaseOutcome {
    return { validMove: true, turnOver, floodLog };
}

/**
 * Ends the game in §4.1's shared win — the only thing in this game that does,
 * and only ever from a Helicopter Lift being played (BannedIsletPlayCard).
 * §4.1's first three conditions are `isEscapeReady`; playing the card is the
 * fourth, which is what makes the win an action taken rather than a state
 * reached.
 *
 * A co-op result, so no single id can be the winner: finishGame reads
 * 'teamwin' as one shared ending for the whole roster.
 */
function endInEscape(data: IBannedIsletGameData): void {
    data.complete = true;
    data.winner = '';
    data.endReason = 'teamwin';
    data.currentTurn = '';
    data.gameState.history.unshift({
        text: `All four treasures are off the island and the whole team is off ${tileName(PIER_TILE)} — they win!`,
    });
}

/**
 * Ends the game in the shared defeat of §4.2, the moment one of its four
 * conditions is detected — mirroring what CheckGameOver does for the win,
 * since a loss can only be noticed here, mid-resolution, rather than
 * re-derived from the state afterwards.
 *
 * `reason` is the log line's clause, and by default the `endDetail` the
 * finish banner, the result page and the "your team lost" push all read back
 * (§4.2): 'teamloss' alone can't say which of the four it was, and a table
 * that has just drowned wants to know. `detail` splits the two for the one
 * defeat that names a player, because only `gameState.history` is run through
 * `resolveHistory` — a `{{userId}}` token reaching `endDetail` would be
 * rendered raw. The same split, and the same reason, as Outbreak's
 * endInTeamLoss.
 */
function endInTeamLoss(data: IBannedIsletGameData, reason: string, detail: string = reason): void {
    data.complete = true;
    data.winner = '';
    data.endReason = 'teamloss';
    data.endDetail = detail;
    data.currentTurn = '';
    data.gameState.history.unshift({ text: `The team loses — ${reason}.` });
}

/**
 * One command's recorded shuffles, of one pile (§21.4, "Recorded randomness").
 *
 * Returns a shuffler that prefers the order this command recorded the first
 * time it ran and otherwise rolls a fresh one and records it — so a replay,
 * a recap and the turn-timeout cron all reproduce the reshuffle the live game
 * actually got rather than rolling a new one. A single Execute can shuffle the
 * same pile more than once (§16 allows two Waters Rise! in one draw phase, and
 * the flood deck can empty mid-draw on top of that), so what is recorded is a
 * list, consumed in the order the shuffles happen.
 *
 * The field these read and write **must** be named `recorded…`: the command
 * route strips every incoming `recorded…` property precisely because Execute
 * prefers a recorded value, and a field named `floodShuffles` would sail
 * straight through and let a player choose which tiles drown next.
 */
function recordedShuffler<T>(read: () => T[][] | undefined, write: (orders: T[][]) => void): (pile: T[]) => T[] {
    let index = 0;
    return pile => {
        // Copied both ways, deliberately. The caller puts the order it gets
        // back *into* a deck and then draws off it, so handing back the same
        // array the command recorded would let the draw drain the recording —
        // and a replay, reading that same recording, would be drained in turn.
        const order = read()?.[index] ?? shuffle(pile);
        const orders = read() ?? [];
        orders[index] = [...order];
        write(orders);
        index++;
        return [...order];
    };
}

/** What a shuffler of the flood discard looks like to the phases below — recorded by whichever command is running them. */
type FloodShuffler = (pile: BannedIsletTileId[]) => BannedIsletTileId[];

/**
 * §11's Waters Rise!, in its three steps and in order. Drawn in Phase 2 and
 * resolved on the spot rather than joining a hand — §10: it is never held.
 *
 * Step 2 is the whole game (§14.2): everything the island has already suffered
 * goes back on top of the deck, so the tiles about to sink are the ones
 * already hurt. Note what it does *not* do — it draws no flood cards, so
 * nothing sinks here (§16); sinking happens exclusively in Phase 3.
 */
function resolveWatersRise(data: IBannedIsletGameData, shuffleFlood: FloodShuffler): IBannedIsletFloodLogEntry {
    const gs = data.specificGameState;

    // 1 — RAISE. Clamped at the skull so a meter that reaches it reads as
    // exactly LOSING_WATER_LEVEL rather than drifting past it.
    gs.waterLevel = Math.min(gs.waterLevel + 1, LOSING_WATER_LEVEL);
    const entry: IBannedIsletFloodLogEntry = { kind: 'watersRise', waterLevelAfter: gs.waterLevel };
    data.gameState.history.unshift({ text: `Waters Rise! The water meter climbs to level ${gs.waterLevel}` });
    if (isWaterLevelLoss(gs.waterLevel)) {
        endInTeamLoss(data, `the water level reached ${LOSING_WATER_LEVEL}`);
        return entry;
    }
    entry.floodRateAfter = floodRateFor(gs.waterLevel);

    // 2 — SHUFFLE the flood discard and place it on top of the flood deck.
    const order = shuffleFlood(gs.floodDiscard);
    gs.floodDeck = [...order, ...gs.floodDeck];
    gs.floodDiscard = [];
    entry.shuffledBack = order.length;
    data.gameState.history.unshift({
        text: `Waters Rise! ${pluralize(order.length, 'flood card')} go back on top of the deck — the island now loses ${pluralize(entry.floodRateAfter, 'tile')} a turn`,
    });

    // 3 — DISCARD the Waters Rise! card itself, which the caller does as it
    // draws: the card is a treasure-deck card and goes to that discard, not
    // this one.
    return entry;
}

/**
 * §4.2's first two defeats, both of which can only fire on a sinking: the
 * escape point is gone, or a treasure went down with the last of its tiles.
 * Checked in that order because §16 says so — the pier loss fires first, and
 * it does not matter where the pawns were standing.
 */
function endIfSinkingLoss(data: IBannedIsletGameData): boolean {
    const gs = data.specificGameState;
    if (isPierLoss(gs.positions)) {
        endInTeamLoss(data, `${tileName(PIER_TILE)} sank and the way off the island went with it`);
        return true;
    }
    const [lost] = lostTreasures(gs.positions, gs.treasures);
    if (lost) {
        endInTeamLoss(data, `both ${treasureName(lost)} tiles sank with the treasure still on the island`);
        return true;
    }
    return false;
}

/**
 * §9.2: every pawn standing on the tile that just sank swims, by rule rather
 * than by the swimmer — §21.3's deviation, and the one place the app decides
 * something a player would have decided. That makes legibility the whole job
 * here: each swim gets its own history line and its own entry in the flood
 * log, so nobody comes back to a pawn that quietly moved.
 *
 * Iterated in turn order rather than map order so the log reads identically on
 * replay. A pawn with nowhere to go is the drowning defeat, and it stops the
 * rest of the phase.
 */
function resolveSwims(data: IBannedIsletGameData, position: number): IBannedIsletSwim[] {
    const gs = data.specificGameState;
    const sunkTile = tileName(gs.positions[position].tile);
    const swims: IBannedIsletSwim[] = [];

    for (const userId of data.gameState.turnOrder) {
        const ps = gs.players.get(userId);
        if (!ps || ps.position !== position) continue;

        const to = resolveSwim(gs.positions, position, ps.role);
        swims.push({ userId, from: position, to });
        if (to === null) {
            endInTeamLoss(
                data,
                `${userToken(userId)} went into the water off ${sunkTile} with nowhere to swim`,
                `a player was swept off ${sunkTile} with nowhere to swim`,
            );
            return swims;
        }
        ps.position = to;
        data.gameState.history.unshift(playerHistory(userId, `swam off ${sunkTile} to ${tileName(gs.positions[to].tile)}`));
    }
    return swims;
}

/**
 * §7 Phase 3: draw flood cards equal to the current rate (§11), flipping dry
 * tiles to flooded and sinking the ones already flooded (§9.1) — and removing
 * a sunk tile's card from the game rather than discarding it, which is why the
 * late game floods the same survivors over and over (§14.2).
 *
 * Stops the instant one of §4.2's defeats fires rather than finishing the
 * remaining draws, exactly as Outbreak's infect phase does, and returns the
 * per-card log both the end-of-turn reveal and the away recap read (§21.4).
 *
 * Shared by both commands that can finish a turn: BannedIsletEndTurn runs it
 * straight through, and BannedIsletDiscard runs it once the hand is back under
 * the limit — so there is exactly one place that floods.
 */
function resolveFloodPhase(data: IBannedIsletGameData, shuffleFlood: FloodShuffler): IBannedIsletFloodLogEntry[] {
    if (data.complete) return [];
    const gs = data.specificGameState;
    const log: IBannedIsletFloodLogEntry[] = [];
    const rate = floodRateFor(gs.waterLevel);

    for (let drawn = 0; drawn < rate; drawn++) {
        if (gs.floodDeck.length === 0) {
            // §11: the deck empties mid-draw in most Elite and Legendary
            // games, and the draw continues into a reshuffled discard rather
            // than being truncated — "it is not an exception case, it is the
            // endgame". The discard can be empty too once enough tiles have
            // taken their cards out of the game with them, and then there is
            // genuinely nothing left to draw.
            if (gs.floodDiscard.length === 0) break;
            const order = shuffleFlood(gs.floodDiscard);
            gs.floodDeck = order;
            gs.floodDiscard = [];
            log.push({ kind: 'reshuffle', shuffledBack: order.length });
            data.gameState.history.unshift({ text: `The flood deck ran dry — ${pluralize(order.length, 'card')} shuffled back into it` });
        }

        const tile = gs.floodDeck.shift()!;
        // rules.ts owns §9.1's transition and, with it, the easy-to-miss part:
        // whether this card leaves the game. The island it hands back is a
        // copy, so the one changed state is written through to the saved
        // positions array rather than replacing it — everything downstream
        // (the swim, the loss checks) reads the live island.
        const result = applyFloodCard(gs.positions, tile);
        if (result.position >= 0) gs.positions[result.position].state = result.to;
        if (!result.cardLeavesGame) gs.floodDiscard.push(tile);

        const entry: IBannedIsletFloodLogEntry = { kind: 'flood', tile, outcome: result.to };
        log.push(entry);

        if (!result.sank) {
            data.gameState.history.unshift({ text: `The sea floods ${tileName(tile)} — one more card and it is gone` });
            continue;
        }
        data.gameState.history.unshift({ text: `${tileName(tile)} sinks for good, and its flood card leaves the game` });

        if (endIfSinkingLoss(data)) return log;
        entry.swims = resolveSwims(data, result.position);
        if (data.complete) return log;
    }
    return log;
}

/**
 * The end of a turn the hand limit held open (§10, §16): once the hand is back
 * at the limit the island gets its turn after all, so the phase goes back to
 * 'actions' and Phase 3 runs in BannedIsletEndTurn's place.
 *
 * Two commands can bring a hand down — BannedIsletDiscard by letting cards go,
 * and BannedIsletPlayCard by playing one of §10's specials instead of
 * discarding it, which §10 calls "the only way Sandbags reliably reaches the
 * board" — so both finish the turn through this, and the two cannot drift
 * apart. Outbreak's maybeFinishDrawPhase is the same helper for the same pair.
 *
 * Does nothing outside the discard phase (a special played during the action
 * phase ends nothing) and nothing while the hand is still over the limit (a
 * player two cards over who plays one still owes a discard).
 */
function maybeFinishFloodPhase(
    data: IBannedIsletGameData,
    ps: IBannedIsletPlayerState,
    shuffleFlood: FloodShuffler,
): IBannedIsletFloodPhaseOutcome {
    const gs = data.specificGameState;
    if (gs.phase !== 'discard' || ps.hand.length > HAND_LIMIT) return floodPhaseOutcome(false, []);
    gs.phase = 'actions';
    return floodPhaseOutcome(true, resolveFloodPhase(data, shuffleFlood));
}

// ─── BannedIsletEndTurn ─────────────────────────────────────────────────────

@serializable
export class BannedIsletEndTurn implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    /**
     * Every shuffle of the **flood discard** this Execute performed, in the
     * order it performed them — §11's Waters Rise! step 2 and the empty-deck
     * reshuffle of Phase 3, which are the same pile and so share one list.
     * §21.4 names this field, and names it now rather than in a later PR:
     * Train Time's §11 is the cautionary tale of what retrofitting a
     * `recorded…` field onto shipped history costs. Stripped from live
     * requests by stripRecordedRandomness; supplied on replay.
     */
    recordedFloodShuffles?: BannedIsletTileId[][];
    /**
     * The same, for the **treasure deck** — §10's routine reshuffle when it
     * runs out, which §13 expects in any long game. §21.4 lists only the flood
     * shuffles as mid-game randomness and misses this one; it is recorded here
     * for the identical reason, in the same PR, rather than being discovered
     * later by a replay that dealt somebody a different hand.
     */
    recordedTreasureShuffles?: BannedIsletCardId[][];
    readonly className = 'BannedIsletEndTurn';

    myString() { return 'ended their turn'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IBannedIsletGameData;
        const gs = data.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        if (gs.phase !== 'actions') return INVALID;
        // The three actions are spent or forfeited before the island gets its
        // turn — §8's Pass is how a player bails out early, and it zeroes the
        // counter rather than ending the turn itself.
        if (ps.actionsLeft > 0) return INVALID;

        const shuffleFlood = recordedShuffler<BannedIsletTileId>(
            () => this.recordedFloodShuffles,
            orders => { this.recordedFloodShuffles = orders; },
        );
        const shuffleTreasure = recordedShuffler<BannedIsletCardId>(
            () => this.recordedTreasureShuffles,
            orders => { this.recordedTreasureShuffles = orders; },
        );

        const floodLog: IBannedIsletFloodLogEntry[] = [];

        // ── Phase 2 (§7, §10): draw two treasure cards. A Waters Rise! is
        //    resolved fully and immediately instead of joining the hand, and
        //    §16 is explicit that a second one drawn in the same phase picks
        //    up the discard pile the first one just created.
        let drawn = 0;
        for (let i = 0; i < CARDS_DRAWN_PER_TURN; i++) {
            if (gs.treasureDeck.length === 0) {
                // §10: routine rather than a crisis — treasure cards are never
                // removed from the game, so the discard always refills the
                // deck. (It can only be empty on a table that is holding every
                // card in its hands, which the 5-card limit makes unreachable
                // — but a card that can't be drawn skips the draw rather than
                // crashing the command.)
                if (gs.treasureDiscard.length === 0) break;
                gs.treasureDeck = shuffleTreasure(gs.treasureDiscard);
                gs.treasureDiscard = [];
                data.gameState.history.unshift({ text: 'The treasure deck ran out — its discard pile is shuffled into a new one' });
            }

            const card = gs.treasureDeck.shift()!;
            if (card === 'watersRise') {
                gs.treasureDiscard.push(card);
                floodLog.push(resolveWatersRise(data, shuffleFlood));
                if (data.complete) return floodPhaseOutcome(true, floodLog);
                continue;
            }
            ps.hand.push(card);
            drawn++;
        }
        if (drawn > 0) {
            data.gameState.history.unshift(playerHistory(this.senderId, `drew ${pluralize(drawn, 'treasure card')}`));
        }

        // ── The hand limit (§10, §16): checked at the end of Phase 2, so the
        //    island waits. The turn stays open until BannedIsletDiscard closes
        //    it, and that command runs Phase 3 in this one's place.
        if (ps.hand.length > HAND_LIMIT) {
            gs.phase = 'discard';
            data.gameState.history.unshift(playerHistory(this.senderId, `must discard down to ${HAND_LIMIT} cards`));
            return floodPhaseOutcome(false, floodLog);
        }

        floodLog.push(...resolveFloodPhase(data, shuffleFlood));
        return floodPhaseOutcome(true, floodLog);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── BannedIsletDiscard ─────────────────────────────────────────────────────

@serializable
export class BannedIsletDiscard implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    /**
     * The cards to drop, down to HAND_LIMIT. §10's cards are identified by
     * what they are rather than by a serial number — five Ember Crown cards
     * are five of the same card — so this is a multiset and a repeated id
     * means "two of those", which is exactly how a hand of four matching
     * cards gets trimmed.
     */
    cardIds: BannedIsletCardId[] = [];
    /** Phase 3 can still empty the flood deck when this command runs it (§11) — see BannedIsletEndTurn.recordedFloodShuffles. */
    recordedFloodShuffles?: BannedIsletTileId[][];
    readonly className = 'BannedIsletDiscard';

    myString() { return `discarded ${pluralize(this.cardIds.length, 'card')} down to the hand limit`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IBannedIsletGameData;
        const gs = data.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        if (gs.phase !== 'discard') return INVALID;

        const chosen = Array.isArray(this.cardIds) ? this.cardIds : [];
        if (chosen.length === 0) return INVALID;
        // Must reach the limit, and no further than it — the same short-of or
        // past-it rejection a capture applies to its own count.
        if (ps.hand.length - chosen.length !== HAND_LIMIT) return INVALID;
        // Held as a multiset, not a set: discarding two Ember Crowns needs two
        // of them in hand. Checked against a copy first so a list naming a card
        // the player doesn't hold changes nothing at all.
        const check = [...ps.hand];
        for (const card of chosen) {
            const index = check.indexOf(card);
            if (index < 0) return INVALID;
            check.splice(index, 1);
        }

        for (const card of chosen) ps.hand.splice(ps.hand.indexOf(card), 1);
        gs.treasureDiscard.push(...chosen);
        data.gameState.history.unshift(playerHistory(
            this.senderId,
            `discarded ${pluralize(chosen.length, 'card')} down to the hand limit`,
        ));

        // The check above guarantees the hand is now exactly at the limit, so
        // this always finishes the turn the draw left open: Phase 3 runs here,
        // in BannedIsletEndTurn's place.
        const shuffleFlood = recordedShuffler<BannedIsletTileId>(
            () => this.recordedFloodShuffles,
            orders => { this.recordedFloodShuffles = orders; },
        );
        return maybeFinishFloodPhase(data, ps, shuffleFlood);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  THE SPECIAL CARDS (§10, §21.6 PR 8)
// ═══════════════════════════════════════════════════════════════════════════
//
// §10's two playable specials in one parameterised command — the fourth and
// last of §21.4's "four command classes, not fifteen". Neither costs an action
// (§8: special cards "are not actions and do not cost one"), so neither
// touches `actionsLeft`, and §21.3 puts both on the holder's own turn: at any
// point in their action phase, and during their own discard phase to duck the
// hand limit, which §10 calls the only way Sandbags reliably reaches the
// board. The command route already rejects anything from a user who isn't
// `currentTurn`, so nothing here re-checks whose turn it is.
//
// This is also where the game is won. §4.1's fourth condition is a Helicopter
// Lift actually played, which is what makes the win an action taken rather
// than a state reached — see endInEscape, and CheckGameOver, which derives
// nothing precisely so that the team can be one card short of escaping.

/**
 * §10 Sandbags: dry any one flooded tile on the island, free and from
 * anywhere — the whole of what §21.3 left the card when async play took its
 * timing away. A dry or sunk target is illegal rather than a wasted card
 * (§16), which is exactly what `sandbagsTargets` listing only the flooded ones
 * expresses.
 */
function applySandbags(gs: IBannedIsletSpecificGameState, target: number): string | null {
    if (!sandbagsTargets(gs.positions).includes(target)) return null;

    gs.positions[target].state = 'dry';
    return `played Sandbags on ${tileName(gs.positions[target].tile)}, drying it back out`;
}

/**
 * §10 Helicopter Lift: move any number of pawns from one tile to any other,
 * free. `liftOrigin` owns "from one tile" — a passenger list spanning two of
 * them is one helicopter short — and `flightTargets` owns "any other tile",
 * which is the same reach as §12's Pilot flight because it is the same
 * helicopter.
 *
 * An **empty passenger list is §4.1's escape call**: the lift played to leave
 * the island rather than to cross it, which moves nobody because everybody is
 * already standing on Beacon Pier. That is the one form of this card a reader
 * of §10 alone would not predict, so it is recorded in §21.3 — and it is why
 * `target` is -1 there rather than naming a tile the helicopter would fly to.
 */
function applyHelicopterLift(
    gs: IBannedIsletSpecificGameState,
    ps: IBannedIsletPlayerState,
    userIds: string[],
    target: number,
): string | null {
    if (userIds.length === 0) {
        if (target >= 0) return null;
        return `played Helicopter Lift, bringing the helicopter down onto ${tileName(gs.positions[ps.position].tile)}`;
    }

    const from = liftOrigin(pawnList(gs), userIds);
    if (from === null) return null;
    if (!flightTargets(gs.positions, from).includes(target)) return null;

    for (const userId of userIds) playerState(gs, userId)!.position = target;

    const tokens = userIds.map(userToken);
    const flown = tokens.length === 1 ? tokens[0] : `${tokens.slice(0, -1).join(', ')} and ${tokens[tokens.length - 1]}`;
    return `played Helicopter Lift, flying ${flown} from ${tileName(gs.positions[from].tile)} to ${tileName(gs.positions[target].tile)}`;
}

@serializable
export class BannedIsletPlayCard implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    /** Which of §10's two playable specials — and it must be one the sender is actually holding. */
    cardId: BannedIsletCardId | null = null;
    /** Sandbags: the flooded tile to dry. Helicopter Lift: where the passengers land, or -1 for §4.1's escape call, which flies nobody anywhere. */
    target: number = -1;
    /** Helicopter Lift: whose pawns fly, all of them from one tile (§10). Empty for the escape call, and unread by Sandbags. */
    userIds: string[] = [];
    /**
     * Playing a special during the discard phase can close the turn the hand
     * limit held open, and closing it runs Phase 3 — which can empty the flood
     * deck and reshuffle its discard (§11). Same field, same name and same
     * reason as BannedIsletEndTurn's: stripped from live requests by
     * stripRecordedRandomness, supplied on replay.
     */
    recordedFloodShuffles?: BannedIsletTileId[][];
    readonly className = 'BannedIsletPlayCard';

    myString() {
        return this.cardId ? `played ${cardName(this.cardId)}` : 'played a special card';
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const data = gameData as IBannedIsletGameData;
        const gs = data.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        // Both of the game's phases accept a special (§21.3), so — unlike
        // every other command here — there is no phase to refuse.
        const card = this.cardId;
        // Held, and one of the two that can be played at all: a treasure card
        // is collected rather than played (§8), and Waters Rise! is never in a
        // hand to begin with (§10).
        if (!card || !isPlayableCard(card) || !ps.hand.includes(card)) return INVALID;

        const passengers = Array.isArray(this.userIds) ? this.userIds : [];
        const historyLine = card === 'sandbags'
            ? applySandbags(gs, this.target)
            : applyHelicopterLift(gs, ps, passengers, this.target);
        // Validated before it is spent: an illegal target leaves the card in
        // the hand rather than burning the team's escape on a no-op.
        if (historyLine === null) return INVALID;

        ps.hand.splice(ps.hand.indexOf(card), 1);
        gs.treasureDiscard.push(card);
        data.gameState.history.unshift(playerHistory(this.senderId, historyLine));

        // §4.1 and §16: all four conditions are checked at the moment the card
        // is played, and the card is spent either way. Checked *after* the lift
        // has moved whoever it moved, so a lift that carries the last pawn home
        // wins on the spot rather than needing a second one.
        if (card === 'helicopterLift' && isEscapeReady(gs.positions, gs.treasures, pawnList(gs).map(p => p.position))) {
            endInEscape(data);
            return floodPhaseOutcome(true, []);
        }

        // Played in the action phase this ends nothing; played to duck the hand
        // limit it is what finally lets the island take its turn (§10).
        const shuffleFlood = recordedShuffler<BannedIsletTileId>(
            () => this.recordedFloodShuffles,
            orders => { this.recordedFloodShuffles = orders; },
        );
        return maybeFinishFloodPhase(data, ps, shuffleFlood);
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
