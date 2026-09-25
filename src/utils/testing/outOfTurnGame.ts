// A game that plays out of turn, for the client tests that need one
// (docs/out-of-turn-actions.md §5.7). No real game sets
// `GameMeta.hasOutOfTurnPlays` yet — and a test pinned to whichever one does
// would change meaning the day another is flagged — so this registers a game
// of its own in `GAME_META` around each test, keeping the real lookup in play.

import { afterEach, beforeEach } from "vitest";
import { GAME_META } from "@/utils/ui/games";

/** The `gameType.url` of the test-only game with out-of-turn plays. */
export const OUT_OF_TURN_TEST_GAME = "testinterrupts";

/** Registers `OUT_OF_TURN_TEST_GAME` for every test in the calling suite. */
export function registerOutOfTurnTestGame(): void {
    beforeEach(() => {
        GAME_META[OUT_OF_TURN_TEST_GAME] = { ...GAME_META.outbreak, url: OUT_OF_TURN_TEST_GAME, hasOutOfTurnPlays: true };
    });
    afterEach(() => {
        delete GAME_META[OUT_OF_TURN_TEST_GAME];
    });
}

