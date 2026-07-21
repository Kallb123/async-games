import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import {
    SNAKES_AND_LADDERS_LADDERS,
    SNAKES_AND_LADDERS_SNAKES,
    type ISnakesAndLaddersDiceRollOutcome,
} from "@/utils/apiModels/GameLogic";
import type { ISnakesAndLaddersGameStateResponse } from "./apiModels";

// Position of a given player in a response-shaped Snakes & Ladders state.
function positionOf(state: ISnakesAndLaddersGameStateResponse | undefined, userId: string): number {
    if (!state?.playerStates) return 0;
    const entry = Object.values(state.playerStates).find((p) => p.userId === userId);
    return entry?.position ?? 0;
}

// Turns one replayed dice roll into a single recap event. Everything it needs is
// in the roll outcome (roll, final square, snake/ladder flags) plus the mover's
// square before the roll, read from the previous snapshot.
function toEvents(
    prev: ITurnSnapshot,
    _next: ITurnSnapshot,
    command: IGameCommand,
    outcome: ICommandOutcome
): IGameEvent[] {
    const roll = outcome as ISnakesAndLaddersDiceRollOutcome;
    // Only dice rolls produce recap events (the game has no other command type).
    if (typeof roll.roll !== "number") return [];

    const name = command.senderUsername;
    const from = positionOf(prev.specificGameState as ISnakesAndLaddersGameStateResponse, command.senderId);
    const landing = from + roll.roll; // square before any snake/ladder redirect
    const to = roll.newPosition;

    let type: string;
    let glyph: string;
    let title: string;
    let detail: string;

    if (to >= 100) {
        type = "sl_win";
        glyph = "🏁";
        title = `${name} rolled ${roll.roll} and reached 100`;
        detail = `${from} → 100 · winner!`;
    } else if (roll.landedOnLadder) {
        type = "sl_ladder";
        glyph = "🪜";
        title = `${name} rolled ${roll.roll}, climbed a ladder`;
        detail = `${from} → ${landing} → up to ${to}`;
    } else if (roll.landedOnSnake) {
        type = "sl_snake";
        glyph = "🐍";
        title = `${name} rolled ${roll.roll}, hit a snake`;
        detail = `${landing} → slid down to ${to}`;
    } else if (landing > 100) {
        type = "sl_nomove";
        glyph = "🎲";
        title = `${name} rolled ${roll.roll} — no move`;
        detail = `needs exactly ${100 - from} to win`;
    } else if (to >= 80) {
        type = "sl_close";
        glyph = "👑";
        title = `${name} rolled ${roll.roll} — now on ${to}`;
        detail = `${100 - to} squares from winning`;
    } else {
        type = "sl_move";
        glyph = "🎲";
        title = `${name} rolled ${roll.roll}, moved to ${to}`;
        detail = `square ${from} → ${to}`;
    }

    return [
        {
            id: command.id,
            commandId: command.id,
            timestamp: command.timestamp,
            actorId: command.senderId,
            actorUsername: name,
            type,
            glyph,
            title,
            detail,
        },
    ];
}

function summarize(events: IGameEvent[], _forUserId: string): IRecapSummary {
    const n = events.length;
    const climbs = events.filter((e) => e.type === "sl_ladder").length;
    const slides = events.filter((e) => e.type === "sl_snake").length;
    const wins = events.filter((e) => e.type === "sl_win").length;

    let tail = ".";
    if (wins) {
        tail = " — and someone's already home. 🏁";
    } else if (climbs && slides) {
        tail = " — one big climb, one nasty slide.";
    } else if (climbs) {
        tail = climbs > 1 ? " — ladders were kind." : " — someone found a ladder.";
    } else if (slides) {
        tail = slides > 1 ? " — the snakes were busy." : " — someone hit a snake.";
    }

    return {
        headline: "Your roll again 👋",
        subline: `${n} roll${n === 1 ? "" : "s"} happened while you were away${tail}`,
    };
}

// Points out the nearest reachable ladder ahead (a roll away), or failing that a
// snake to watch out for. Hand-written heuristic — deterministic, no model call.
function tip(liveState: unknown, forUserId: string): IRecapTip | null {
    const state = liveState as ISnakesAndLaddersGameStateResponse | undefined;
    const pos = positionOf(state, forUserId);
    if (pos <= 0 || pos >= 100) return null;

    for (let r = 1; r <= 6; r++) {
        const square = pos + r;
        if (square > 100) break;
        const ladderTop = SNAKES_AND_LADDERS_LADDERS[square];
        if (ladderTop !== undefined) {
            return {
                glyph: "🎲",
                text:
                    `You're on ${pos}, ${r} square${r === 1 ? "" : "s"} below the ladder at ${square}. ` +
                    `Roll a ${r} and you leap to ${ladderTop}.`,
            };
        }
    }

    for (let r = 1; r <= 6; r++) {
        const square = pos + r;
        if (square > 100) break;
        const snakeTail = SNAKES_AND_LADDERS_SNAKES[square];
        if (snakeTail !== undefined) {
            return {
                glyph: "🐍",
                text:
                    `Watch your step: a ${r} lands you on the snake at ${square} ` +
                    `and drops you back to ${snakeTail}.`,
            };
        }
    }

    return null;
}

// Registered by the recap engine (src/utils/games/recap.ts), mirroring how
// replay.ts wires up its per-game replay adapters. This module only imports
// engine *types*, so there's no import cycle at runtime.
export const snakesAndLaddersRecapAdapter: IRecapAdapter = {
    className: "SnakesAndLaddersGameType",
    toEvents,
    summarize,
    tip,
};
