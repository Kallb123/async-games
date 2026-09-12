import { describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { runCommand } from "@/utils/games/commandPipeline";
import { BannedIsletAction, BannedIsletDiscard, BannedIsletEndTurn, BannedIsletGameType } from "./BannedIsletLogic";
import {
    IBannedIsletGameData,
    buildInitialBannedIsletState,
    cloneBannedIsletState,
    gameStateToModel,
} from "./BannedIsletModels";
import { HAND_LIMIT } from "./board";

// docs/games/banned-islet.md §21.7, "Replay equality": run a game, rebuild it
// through buildTimeline(), and assert the final state matches. With two decks
// and a mid-game shuffle, that single assertion is worth more than any
// individual rules test — it is the only thing that proves
// `recordedFloodShuffles` and `recordedTreasureShuffles` are actually consumed
// on the way back rather than rolled again. Mirrors
// src/games/FiresOut/replay.test.ts, which is the model
// docs/turn-recap-and-planning.md points at for a snapshot-replay game.

const PLAYERS = ["u1", "u2", "u3"];
const NAMES = { u1: "Alice", u2: "Bob", u3: "Cara" };

function noRandomness<T>(run: () => T): T {
    // Both sources: the rules draw through crypto.getRandomValues
    // (src/utils/games/random.ts), but a command reaching for Math.random
    // directly would replay non-deterministically just the same, and this
    // guard is worthless if it can pass without noticing.
    const consumed = () => { throw new Error("replay consumed randomness"); };
    const entropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(consumed);
    const random = vi.spyOn(Math, "random").mockImplementation(consumed);
    try {
        return run();
    } finally {
        entropy.mockRestore();
        random.mockRestore();
    }
}

function makeGame(): IBannedIsletGameData {
    const specificGameState = buildInitialBannedIsletState([...PLAYERS], 'legendary');
    return {
        gameId: "g",
        gameType: new BannedIsletGameType(),
        currentTurn: PLAYERS[0],
        userIdList: [...PLAYERS],
        turnTimer: 0,
        gameState: { turnOrder: [...PLAYERS], history: [], commandHistory: [] },
        specificGameState,
        initialSpecificGameState: cloneBannedIsletState(specificGameState, [...PLAYERS]),
        complete: false,
        winner: "",
    } as unknown as IBannedIsletGameData;
}

function send(command: BannedIsletAction | BannedIsletEndTurn | BannedIsletDiscard, senderId: string) {
    command.senderId = senderId;
    command.senderUsername = NAMES[senderId as keyof typeof NAMES] ?? senderId;
    return command;
}

/**
 * A table that passes every turn, played through the real command pipeline.
 * Nothing here is good play — the point is that Legendary's rate of four
 * drowns them in a handful of turns while drawing the whole treasure deck,
 * which is what puts a Waters Rise! shuffle, a flood-deck reshuffle and a
 * treasure-deck reshuffle into one command log.
 */
async function playPassiveGame(): Promise<IBannedIsletGameData> {
    const game = makeGame();
    const gameType = new BannedIsletGameType();

    for (let turn = 0; turn < 200 && !game.complete; turn++) {
        const userId = game.currentTurn;
        const ps = game.specificGameState.players.get(userId)!;

        if (game.specificGameState.phase === 'discard') {
            const command = new BannedIsletDiscard();
            command.cardIds = ps.hand.slice(0, ps.hand.length - HAND_LIMIT);
            await runCommand(game, gameType, send(command, userId));
            continue;
        }

        const pass = new BannedIsletAction();
        pass.kind = 'pass';
        await runCommand(game, gameType, send(pass, userId));
        if (game.complete) break;
        await runCommand(game, gameType, send(new BannedIsletEndTurn(), userId));
    }
    return game;
}

describe("Banned Islet replay", () => {
    it("replays a whole game to exactly the live state without consuming randomness", async () => {
        const game = await playPassiveGame();
        expect(game.complete).toBe(true);
        expect(game.gameState.commandHistory.length).toBeGreaterThan(0);
        // The run has to have exercised the thing being guarded, or the
        // assertion below proves nothing: at least one command re-ordered a
        // deck mid-game, which is the only randomness replay has to reproduce.
        const shuffled = game.gameState.commandHistory.filter(
            c => (c as BannedIsletEndTurn).recordedFloodShuffles?.length
                || (c as BannedIsletEndTurn).recordedTreasureShuffles?.length,
        );
        expect(shuffled.length).toBeGreaterThan(0);

        const userIdNameMap = { ...NAMES };
        const timeline = await noRandomness(() => buildTimeline(game, userIdNameMap));

        // One snapshot for the opening island, then one per accepted command.
        expect(timeline.snapshots.length).toBe(game.gameState.commandHistory.length + 1);
        expect(timeline.snapshots[timeline.currentIndex].specificGameState)
            .toEqual(gameStateToModel(game.specificGameState, userIdNameMap, null));
    });

    it("has no timeline for a game created before the starting snapshot existed", async () => {
        const game = makeGame();
        delete (game as { initialSpecificGameState?: unknown }).initialSpecificGameState;
        await expect(buildTimeline(game, { ...NAMES })).rejects.toThrow();
    });
});
