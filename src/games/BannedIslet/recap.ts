import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome, IBannedIsletFloodPhaseOutcome } from "@/utils/apiModels/GameLogic";
import type { IBannedIsletSpecificGameStateResponse } from "@/games/BannedIslet/apiModels";
import {
    CARDS_TO_CAPTURE,
    TREASURES,
    TREASURE_IDS,
    tileName,
    treasureName,
    type BannedIsletTileId,
    type BannedIsletTreasureId,
} from "@/games/BannedIslet/board";
import type { IBannedIsletFloodLogEntry } from "@/games/BannedIslet/rules";
import { capturableTreasureAt, countCards, isEscapeReady, positionOfTile } from "@/games/BannedIslet/rules";
import { swimLines, tileList, watersRiseLines } from "@/games/BannedIslet/narration";
import { playerByUserId } from "@/utils/apiModels/GameDataApi";
import { pluralize } from "@/utils/ui/text";

// docs/games/banned-islet.md §21.5's row selection, and nothing else: the
// away-time narrative is the island getting smaller (§3), so sinkings,
// captures, Waters Rise! and forced swims each earn a row while plain
// movement and shoring do not — the same editorial line Outbreak's recap
// takes on Treat and Share Knowledge, and Sandbags is shoring by another
// name. The one addition to that list is BI_FLOOD, which fires only on a
// flood phase that sank nothing: at low water most turns only flood, and
// without it the sea would take a turn the recap never mentions. It is
// Outbreak's own `else` branch under "the board got worse", for the same
// reason.
const BI_SINK = "bi_sink";
const BI_FLOOD = "bi_flood";
const BI_SWIM = "bi_swim";
const BI_WATERS_RISE = "bi_watersrise";
const BI_CAPTURE = "bi_capture";
const BI_WIN = "bi_win";
const BI_LOSS = "bi_loss";

function state(snapshot: ITurnSnapshot): IBannedIsletSpecificGameStateResponse {
    return snapshot.specificGameState as IBannedIsletSpecificGameStateResponse;
}

/** The tiles one command's flood log put into a given state. */
function tilesThat(log: IBannedIsletFloodLogEntry[], outcome: 'flooded' | 'sunk'): BannedIsletTileId[] {
    return log.filter(e => e.kind === 'flood' && e.outcome === outcome).map(e => e.tile!);
}

/** The treasures that came off the island between two snapshots (§8). */
function newlyCaptured(
    prev: IBannedIsletSpecificGameStateResponse,
    next: IBannedIsletSpecificGameStateResponse,
): BannedIsletTreasureId[] {
    return TREASURE_IDS.filter(id => next.treasures[id] && !prev.treasures[id]);
}

function capturedCount(gs: IBannedIsletSpecificGameStateResponse): number {
    return TREASURE_IDS.filter(id => gs.treasures[id]).length;
}

/**
 * Turns one replayed Banned Islet command into its recap row(s). The drama is
 * almost never in what a player chose — it is in what the flood deck did to
 * them — so this reads `IBannedIsletFloodPhaseOutcome.floodLog`, the
 * structured record of the phase, rather than diffing two islands tile by
 * tile. The log is asked of every command class rather than only
 * BannedIsletEndTurn, because a hand-limit BannedIsletDiscard or a
 * BannedIsletPlayCard can be what finally closes the turn and runs Phase 3;
 * every other command carries no log, so this structurally no-ops for them.
 */
function toEvents(
    prev: ITurnSnapshot,
    next: ITurnSnapshot,
    command: IGameCommand,
    outcome: ICommandOutcome
): IGameEvent[] {
    const prevState = state(prev);
    const nextState = state(next);
    const name = command.senderUsername;
    const base = {
        id: command.id,
        commandId: command.id,
        timestamp: command.timestamp,
        actorId: command.senderId,
        actorUsername: name,
    };

    const events: IGameEvent[] = [];

    // ── The team fighting back: a relic off the island (§8) ───────────────
    // Read off the treasures record rather than the command's own `kind`,
    // so it stays right whichever command turns out to claim one.
    for (const treasure of newlyCaptured(prevState, nextState)) {
        const captured = capturedCount(nextState);
        events.push({
            ...base,
            id: `${command.id}:capture:${treasure}`,
            type: BI_CAPTURE,
            glyph: '💎',
            title: `${name} captured the ${treasureName(treasure)}!`,
            detail: `${captured} of ${TREASURE_IDS.length} relics aboard`,
        });
    }

    // ── The island getting smaller (§3, §7 Phase 3) ───────────────────────
    const log = (outcome as IBannedIsletFloodPhaseOutcome).floodLog ?? [];

    for (const [index, entry] of log.entries()) {
        if (entry.kind !== 'watersRise') continue;
        events.push({
            ...base,
            id: `${command.id}:rise:${index}`,
            type: BI_WATERS_RISE,
            glyph: entry.floodRateAfter === undefined ? '💀' : '📈',
            ...watersRiseLines(entry),
        });
    }

    const sunk = tilesThat(log, 'sunk');
    if (sunk.length > 0) {
        events.push({
            ...base,
            id: `${command.id}:sunk`,
            type: BI_SINK,
            glyph: '🕳️',
            title: sunk.length > 1
                ? `${pluralize(sunk.length, 'tile')} went under for good`
                : `${tileName(sunk[0])} is gone for good`,
            detail: sunk.length > 1 ? tileList(sunk) : 'Its flood card leaves the game, so the deck closes in on what is left.',
        });
    } else {
        // Only when nothing sank: a sinking already says the island is
        // shrinking, and a second row counting the same phase's floods
        // would bury it.
        const flooded = tilesThat(log, 'flooded');
        if (flooded.length > 0) {
            events.push({
                ...base,
                id: `${command.id}:flooded`,
                type: BI_FLOOD,
                glyph: '🌊',
                title: `The tide came in — ${pluralize(flooded.length, 'tile')} flooded`,
                detail: `${tileList(flooded)} — each of them one card from sinking`,
            });
        }
    }

    // ── The app deciding for a player (§9.2, §21.3) ───────────────────────
    // Never folded into the sinking row above: a pawn moved by the rules
    // rather than by its owner is the one thing this game does on somebody's
    // behalf, so it is always said out loud.
    const swims = log.flatMap(entry => entry.swims ?? []);
    for (const [index, swim] of swims.entries()) {
        const swimmer = nextState.playerStates[swim.userId]?.username ?? 'A player';
        events.push({
            ...base,
            id: `${command.id}:swim:${index}`,
            type: BI_SWIM,
            glyph: swim.to === null ? '💀' : '🏊',
            ...swimLines(swim, swimmer, position => tileName(nextState.positions[position].tile)),
            affectedIds: [swim.userId],
        });
    }

    // ── The ending, however it lands, regardless of which command caused it ──
    if (next.complete && !prev.complete) {
        // §4.1's win is the only ending that leaves the team escape-ready —
        // every one of §4.2's four defeats fires inside the flood phase, and
        // three of them (the pier sinking, a treasure lost, a drowning) are
        // states an escape-ready island cannot be in. Derived from the state
        // rather than the command for the same reason Outbreak's own recap
        // derives its win from `cures`: whichever command happened to be the
        // last one, the island says how it went.
        const won = isEscapeReady(
            nextState.positions,
            nextState.treasures,
            Object.values(nextState.playerStates).map(p => p.position),
        );
        events.push({
            ...base,
            id: `${command.id}:ending`,
            type: won ? BI_WIN : BI_LOSS,
            glyph: won ? '🎉' : '💀',
            title: won
                ? 'All four relics are off the island and the whole team is away — they win!'
                : (next.history[0]?.text ?? 'The sea took the island.'),
            affectedIds: Object.values(nextState.playerStates).map(p => p.userId),
        });
    }

    return events;
}

function summarize(events: IGameEvent[], _forUserId: string): IRecapSummary {
    const sinkings = events.filter(e => e.type === BI_SINK).length;
    const drowned = events.some(e => e.type === BI_SWIM && e.glyph === '💀');
    const swims = events.filter(e => e.type === BI_SWIM).length;
    const rises = events.filter(e => e.type === BI_WATERS_RISE).length;
    const captures = events.filter(e => e.type === BI_CAPTURE).length;
    const lost = events.some(e => e.type === BI_LOSS);
    const won = events.some(e => e.type === BI_WIN);
    const beats = events.filter(e => e.type !== BI_WIN && e.type !== BI_LOSS).length;

    let tail = '.';
    if (lost) {
        tail = ' — and the sea took the island. 💀';
    } else if (won) {
        tail = ' — and the whole team got off with all four relics! 🎉';
    } else if (drowned) {
        tail = ' — and somebody went into the water with nowhere to swim.';
    } else if (rises > 0) {
        tail = ' — Waters Rise!, and everything the island has suffered is back on top of the deck.';
    } else if (sinkings > 0) {
        tail = swims > 0
            ? ' — the island is smaller, and a pawn had to swim for it.'
            : ' — the island is smaller.';
    } else if (captures > 0) {
        tail = captures > 1 ? ' — more relics are aboard.' : ' — another relic is aboard.';
    }

    return {
        headline: 'Your turn again 👋',
        subline: `${pluralize(beats, 'thing', 'things')} happened while you were away${tail}`,
    };
}

/**
 * Points the viewer at the single most urgent thing on the island: a treasure
 * one flood card from being lost for good (§4.2 — the defeat a shore-up could
 * still have prevented), then a capture their own hand already pays for, then
 * the tile they are standing on going under. Reads the live, response-shaped
 * state the engine hands every tip.
 */
function tip(liveState: unknown, forUserId: string): IRecapTip | null {
    const gs = liveState as IBannedIsletSpecificGameStateResponse | undefined;
    if (!gs) return null;
    const me = playerByUserId(gs, forUserId);

    // A treasure down to one tile, and that tile flooded, is a single card
    // away from ending the game (§4.2) — nothing else on the board outranks
    // it, and a shore-up still buys the team a turn.
    for (const def of TREASURES) {
        if (gs.treasures[def.id]) continue;
        const standing = def.tiles
            .map(tile => gs.positions[positionOfTile(gs.positions, tile)])
            .filter(p => p.state !== 'sunk');
        if (standing.length === 1 && standing[0].state === 'flooded') {
            return {
                glyph: '🕳️',
                text: `${tileName(standing[0].tile)} is the last tile the ${treasureName(def.id)} sits on, and it is already flooded — shore it up before the sea takes the treasure with it.`,
            };
        }
    }

    if (me) {
        const ready = capturableTreasureAt(gs.positions, me.position, me.hand, gs.treasures);
        if (ready) {
            return { glyph: '💎', text: `You are standing on the ${treasureName(ready)} with the four cards it costs — capture it.` };
        }

        // The near-miss: three of the four, so the tip is who to ask rather
        // than where to stand.
        for (const treasure of TREASURE_IDS) {
            if (gs.treasures[treasure]) continue;
            if (countCards(me.hand, treasure) === CARDS_TO_CAPTURE - 1) {
                return { glyph: '🃏', text: `You are one card off the ${treasureName(treasure)} — somebody at the table may be holding it.` };
            }
        }

        if (gs.positions[me.position]?.state === 'flooded') {
            return { glyph: '🌊', text: 'The tile you are standing on is flooded — one more card and you are swimming.' };
        }
    }

    return null;
}

// Registered by the recap engine (src/utils/games/recap.ts), mirroring how
// replay.ts wires up its per-game replay adapters.
export const bannedIsletRecapAdapter: IRecapAdapter = {
    className: "BannedIsletGameType",
    toEvents,
    summarize,
    tip,
};
