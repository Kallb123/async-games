import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import {
    ROUTES,
    TrainTimeCardColour,
    claimableRouteIds,
    cityName,
    routeName,
    routeScore,
} from "@/games/TrainTime/board";
import { CARD_LABEL } from "@/games/TrainTime/ui";
import type { ITrainTimeSpecificGameStateResponse, ITrainTimePlayerStateResponse } from "@/games/TrainTime/apiModels";
import { pluralize } from "@/utils/ui/text";

// One action per turn (§5), so — once the two halves of a draw are folded back
// together in postProcess — a recap row is a turn.
const CLAIM = "tt_claim";
const DRAW = "tt_draw";
const DRAW_PAIR = "tt_draw_pair";
const TICKETS = "tt_tickets";
const PASS = "tt_pass";
const LAST_LAP = "tt_lastlap";

function state(snapshot: ITurnSnapshot): ITrainTimeSpecificGameStateResponse {
    return snapshot.specificGameState as ITrainTimeSpecificGameStateResponse;
}

function playerByUserId(
    snapshot: ITurnSnapshot,
    userId: string,
): ITrainTimePlayerStateResponse | undefined {
    return Object.values(state(snapshot).playerStates).find(ps => ps.userId === userId);
}

/**
 * Turns one replayed Train Time command into its recap row. What a player did
 * is public; what they drew mostly isn't, so a blind draw and a kept ticket are
 * reported as the counts everybody at the table can already see — never as the
 * cards themselves (§10).
 */
function toEvents(
    prev: ITurnSnapshot,
    next: ITurnSnapshot,
    command: IGameCommand,
    _outcome: ICommandOutcome
): IGameEvent[] {
    const name = command.senderUsername;
    const base = {
        id: command.id,
        commandId: command.id,
        timestamp: command.timestamp,
        actorId: command.senderId,
        actorUsername: name,
    };

    const events: IGameEvent[] = [];

    switch (command.className) {
        // ── Claiming track: the beat that actually moves the board. ──────────
        case "TrainTimeClaimRoute": {
            const route = ROUTES[(command as unknown as { routeId: number }).routeId];
            if (route) {
                const me = playerByUserId(next, command.senderId);
                const rivals = Object.values(state(next).playerStates)
                    .filter(ps => ps.userId !== command.senderId)
                    .map(ps => ps.longestRun);
                const run = me?.longestRun ?? 0;
                // Claims are public, so the Long Haul race is too (§7).
                const lead = run > Math.max(0, ...rivals) ? ` · longest run now ${run}` : "";
                events.push({
                    ...base,
                    type: CLAIM,
                    glyph: "🚂",
                    title: `${name} claimed ${routeName(route)}`,
                    detail: `${pluralize(route.length, "track")} · +${routeScore(route.length)}${lead}`,
                });
            }
            break;
        }

        // ── Taking carriage cards. Half a turn each; postProcess pairs them. ──
        case "TrainTimeDrawCarriageCard": {
            const draw = command as unknown as { source: "deck" | "market"; marketIndex: number };
            const card: TrainTimeCardColour | undefined = draw.source === "market"
                ? state(prev).market[draw.marketIndex]
                : undefined;
            events.push({
                ...base,
                type: DRAW,
                glyph: "🃏",
                title: card
                    ? `${name} took the face-up ${CARD_LABEL[card]}`
                    : `${name} drew from the deck`,
                detail: card ? `face-up ${CARD_LABEL[card]}` : "blind from the deck",
            });
            break;
        }

        // ── Destination tickets. The draw and the keep are one turn; the keep
        //    is the half that knows how many stuck, so it carries the row. ────
        case "TrainTimeKeepTickets": {
            const before = playerByUserId(prev, command.senderId)?.ticketCount ?? 0;
            // Nobody finishes setup holding no tickets, so an empty pile before
            // the choice means this is the opening deal, not a turn spent.
            if (before === 0) break;
            const kept = (playerByUserId(next, command.senderId)?.ticketCount ?? 0) - before;
            events.push({
                ...base,
                type: TICKETS,
                glyph: "🎫",
                title: `${name} drew destination tickets`,
                detail: `kept ${pluralize(kept, "ticket")}`,
            });
            break;
        }

        case "TrainTimePassTurn":
            events.push({
                ...base,
                type: PASS,
                glyph: "⏭️",
                title: `${name} had no legal move and passed`,
            });
            break;
    }

    // ── The last lap, wherever it was tripped: everybody's clock, so everybody
    //    is affected by it (§7). ───────────────────────────────────────────────
    if (state(prev).finalRoundPending === null && state(next).finalRoundPending !== null) {
        events.push({
            ...base,
            id: `${command.id}:lastlap`,
            type: LAST_LAP,
            glyph: "⏳",
            title: "Last lap — everyone gets one more turn",
            detail: `${name} is down to ${pluralize(playerByUserId(next, command.senderId)?.trains ?? 0, "train")}`,
            affectedIds: Object.values(state(next).playerStates).map(ps => ps.userId),
        });
    }

    return events;
}

// A draw is one action spread over two commands (§5), so the two rows are
// folded back into the single turn they were. Only ever a pair: the merged row
// changes type, so a third draw — which means a second turn, after a skip —
// starts a new row instead of joining this one.
function postProcess(events: IGameEvent[]): IGameEvent[] {
    const merged: IGameEvent[] = [];
    for (const event of events) {
        const last = merged[merged.length - 1];
        if (last && last.type === DRAW && event.type === DRAW && last.actorId === event.actorId) {
            merged[merged.length - 1] = {
                ...last,
                type: DRAW_PAIR,
                title: `${last.actorUsername} drew 2 cards`,
                detail: [last.detail, event.detail].filter(Boolean).join(" · "),
            };
            continue;
        }
        merged.push(event);
    }
    return merged;
}

function summarize(events: IGameEvent[], _forUserId: string): IRecapSummary {
    const moves = events.filter(e => e.type !== LAST_LAP).length;
    const claims = events.filter(e => e.type === CLAIM).length;

    let tail = ".";
    if (events.some(e => e.type === LAST_LAP)) {
        tail = " — and the last lap has started, so this is nearly your last move. ⏳";
    } else if (claims > 1) {
        tail = ` — ${claims} routes went off the board.`;
    } else if (claims === 1) {
        tail = " — a rival took a route off the board.";
    }

    return {
        headline: "Your move again 👋",
        subline: `${pluralize(moves, "move")} happened while you were away${tail}`,
    };
}

// Points the player at the one thing worth doing first: answer the tickets on
// their table, lay the best track their hand already pays for, or draw toward
// the ticket they still haven't connected. Deterministic, no model.
function tip(liveState: unknown, forUserId: string): IRecapTip | null {
    const gs = liveState as ITrainTimeSpecificGameStateResponse | undefined;
    if (!gs) return null;
    const players = Object.values(gs.playerStates);
    const me = players.find(ps => ps.userId === forUserId);
    if (!me) return null;

    if (gs.myPendingTickets.length > 0) {
        return {
            glyph: "🎫",
            text: "You've got tickets on the table — say which ones you're keeping before anything else.",
        };
    }

    // routeOwners are userIds in the response shape, so the claim context is
    // built in those terms (the same join the board screen does).
    const claimable = [...claimableRouteIds({
        routeOwners: gs.routeOwners,
        playerCount: players.length,
        hand: gs.myHand,
        trains: me.trains,
        playerId: me.userId,
    })].map(id => ROUTES[id]);

    if (claimable.length) {
        const best = claimable.reduce((a, b) => (routeScore(b.length) > routeScore(a.length) ? b : a));
        return {
            glyph: "🚂",
            text: `Your hand already pays for ${routeName(best)} — ${pluralize(best.length, "track")} for ${routeScore(best.length)} points.`,
        };
    }

    const open = gs.myTickets.filter(ticket => !ticket.complete).sort((a, b) => b.points - a.points)[0];
    if (open) {
        return {
            glyph: "🎫",
            text: `Nothing's payable yet. ${cityName(open.cityA)} – ${cityName(open.cityB)} is still open on your tickets and worth ${open.points} — draw toward it.`,
        };
    }
    return { glyph: "🃏", text: "Nothing's payable yet — take two cards and build toward a route." };
}

// Registered by the recap engine (src/utils/games/recap.ts), mirroring how
// replay.ts wires up its per-game replay adapters.
export const trainTimeRecapAdapter: IRecapAdapter = {
    className: "TrainTimeGameType",
    toEvents,
    postProcess,
    summarize,
    tip,
};
