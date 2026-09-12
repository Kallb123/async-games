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
    legalMoves,
    legalShoreUps,
    lostTreasures,
    resolveSwim,
    IBannedIsletFloodLogEntry,
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
// One clause of §4.1's win is still missing: a Helicopter Lift actually
// played, which needs PR 8's BannedIsletPlayCard. Until it exists, reaching
// the state is the win.

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

function playerState(gs: IBannedIsletSpecificGameState, userId: string): IBannedIsletPlayerState | undefined {
    return gs.players.get(userId);
}

// §8 Move: one step to an orthogonally adjacent tile that is still there.
// `legalMoves` is the same list the client's action picker offers, so a move
// the picker wouldn't draw is a move Execute won't take (docs/new-game.md,
// "Isomorphic rules modules").
function applyMove(gs: IBannedIsletSpecificGameState, ps: IBannedIsletPlayerState, target: number): string | null {
    if (!legalMoves(gs.positions, ps.position).includes(target)) return null;
    const from = tileName(gs.positions[ps.position].tile);
    ps.position = target;
    return `moved from ${from} to ${tileName(gs.positions[target].tile)}`;
}

// §8 Shore Up: flip this tile or a neighbour from flooded back to dry — the
// only action in the game that gives ground back, and never one that un-sinks
// (§9.1). A dry target is illegal rather than a no-op (§16), which is exactly
// what `legalShoreUps` listing only the flooded ones expresses.
function applyShoreUp(gs: IBannedIsletSpecificGameState, ps: IBannedIsletPlayerState, target: number): string | null {
    if (!legalShoreUps(gs.positions, ps.position).includes(target)) return null;
    gs.positions[target].state = 'dry';
    return `shored up ${tileName(gs.positions[target].tile)}`;
}

// §8 Give a Treasure Card: the game's only transfer, and a face-to-face one —
// both pawns on the same tile. The Messenger (§12) is the exception that makes
// that rule matter and arrives with the rest of the roles in PR 7.
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
    if (!target || target.position !== ps.position) return null;
    if (!card || !isTreasureCard(card)) return null;

    const index = ps.hand.indexOf(card);
    if (index < 0) return null;

    ps.hand.splice(index, 1);
    target.hand.push(card);
    return `gave their ${cardName(card)} card to ${userToken(targetUserId)}`;
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
        const data = gameData as IBannedIsletGameData;
        // §4.2's four defeats can only be detected mid-resolution, inside the
        // flood phase, so they are ended there rather than re-derived here —
        // see endInTeamLoss below, which is what has already set `complete`
        // by the time the command route asks.
        if (data.complete) return true;

        const gs = data.specificGameState;
        const pawns = [...gs.players.values()].map(ps => ps.position);
        if (!isEscapeReady(gs.positions, gs.treasures, pawns)) return false;

        // §4.1: all four treasures aboard and the whole team on an unsunk
        // Beacon Pier. The fourth clause — a Helicopter Lift actually played —
        // is what makes this an action taken rather than a state reached, and
        // PR 8 moves the ending into BannedIsletPlayCard when the card exists
        // to play. Until then reaching the state is the win.
        //
        // A co-op result, so no single id can be the winner: finishGame reads
        // 'teamwin' as one shared ending for the whole roster.
        data.complete = true;
        data.winner = '';
        data.endReason = 'teamwin';
        data.currentTurn = '';
        data.gameState.history.unshift({ text: 'All four treasures are off the island and the team is clear of the water — they win!' });
        return true;
    }
}

// ─── BannedIsletAction ──────────────────────────────────────────────────────

/** §8's action catalogue, plus the two role kinds that aren't one of those (§21.4). The role kinds arrive with the roles themselves, in PR 7. */
export type BannedIsletActionKind = 'move' | 'shoreUp' | 'giveCard' | 'capture' | 'pass';

@serializable
export class BannedIsletAction implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    kind: BannedIsletActionKind = 'pass';
    /** move / shoreUp: the grid position to step onto or dry out. */
    target: number = -1;
    /** giveCard: the teammate the card moves to. */
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
                historyLine = applyShoreUp(gs, ps, this.target);
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

        const to = resolveSwim(gs.positions, position);
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
        gs.phase = 'actions';
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
        return floodPhaseOutcome(true, resolveFloodPhase(data, shuffleFlood));
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
