import { describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { buildAllEvents, buildEventFeed } from "@/utils/games/recap";
import type { IGameCommand } from "@/utils/apiModels/gameCommand";
import { FiresOutAction, FiresOutGameType } from "./FiresOutLogic";
import { perimeterNeighbours } from "./board";
import {
    IFiresOutGameData,
    buildInitialFiresOutState,
    cloneFiresOutState,
    computeFiresOutResultStats,
    gameStateToModel,
} from "./FiresOutModels";

// §17.6 step 11: the fire is the one thing recap and result stats have to get
// exactly right, since a single endTurn can roll an unknown-in-advance number
// of times (§17.4). These tests replay real command logs with Math.random
// ripped out — mirrors src/games/TrainTime/replay.test.ts, the model
// docs/turn-recap-and-planning.md points at for the next snapshot-replay game.

const PLAYERS = ["u1", "u2", "u3"];
const NAMES = { u1: "Alice", u2: "Bob", u3: "Cara" };

function noRandomness<T>(run: () => T): T {
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
        throw new Error("replay consumed randomness");
    });
    try {
        return run();
    } finally {
        random.mockRestore();
    }
}

function makeGame(): IFiresOutGameData {
    const { specificGameState } = buildInitialFiresOutState(PLAYERS, 'family', 'recruit');
    return {
        gameId: "g",
        gameType: new FiresOutGameType(),
        currentTurn: PLAYERS[0],
        userIdList: PLAYERS,
        turnTimer: 0,
        gameState: { turnOrder: [...PLAYERS], history: [], commandHistory: [] },
        specificGameState,
        initialSpecificGameState: cloneFiresOutState(specificGameState),
        complete: false,
        winner: "",
    } as unknown as IFiresOutGameData;
}

/** The command route's pipeline, minus persistence — what buildTimeline mirrors. */
async function play(game: IFiresOutGameData, command: IGameCommand, senderId: string): Promise<void> {
    command.gameId = game.gameId;
    command.senderId = senderId;
    command.senderUsername = NAMES[senderId as keyof typeof NAMES] ?? senderId;
    game.currentTurn = senderId;
    const outcome = await command.Execute(game);
    if (!outcome.validMove) return;
    game.gameState.commandHistory.push(command);
    const gameType = new FiresOutGameType();
    if (gameType.CheckGameOver(game)) return;
    gameType.CheckEndTurn(game, outcome);
}

/**
 * Every firefighter just ends their turn, over and over — the fire (§17.4's
 * only randomness-consuming command) is the whole game here, which is enough
 * to exercise replay determinism without needing a full legal-move bot. A
 * totally passive crew loses on its own (VICTIMS_LOST_TO_LOSE/
 * DAMAGE_TO_COLLAPSE both bound the loop) — this is a replay test, not a
 * strategy one.
 */
async function playPassiveGame(maxTurns = 500): Promise<IFiresOutGameData> {
    const game = makeGame();
    for (let turns = 0; !game.complete && turns < maxTurns; turns++) {
        const active = game.specificGameState.firefighters[game.specificGameState.activeFirefighter];
        const command = new FiresOutAction();
        command.kind = 'endTurn';
        await play(game, command, active.ownerId);
    }
    return game;
}

describe("Fires Out replay", () => {
    it("replays a whole passive game to exactly the live state without consuming randomness", async () => {
        const game = await playPassiveGame();
        expect(game.complete).toBe(true);
        expect(game.gameState.commandHistory.length).toBeGreaterThan(0);

        const userIdNameMap = { ...NAMES };
        const timeline = await noRandomness(() => buildTimeline(game, userIdNameMap));

        // One snapshot for the opening position, then one per accepted command.
        expect(timeline.snapshots.length).toBe(game.gameState.commandHistory.length + 1);
        expect(timeline.snapshots[timeline.currentIndex].specificGameState)
            .toEqual(gameStateToModel(game.specificGameState, userIdNameMap, null));
    });

    it("has no recap for a game created before the starting snapshot existed", async () => {
        const game = makeGame();
        delete (game as { initialSpecificGameState?: unknown }).initialSpecificGameState;
        await expect(buildTimeline(game, { ...NAMES })).rejects.toThrow();
    });

    it("builds a since-you-were-last-here feed off a real command log", async () => {
        const game = await playPassiveGame(6);
        expect(game.complete).toBe(false);
        const feed = await buildEventFeed(game, { ...NAMES }, game.currentTurn);

        expect(feed.hasRecap).toBe(true);
        expect(feed.events.length).toBeGreaterThan(0);
        expect(feed.summary?.subline).toContain("while you were away");
    });

    it("gives a rescue its own row even when it was the Ambulance that moved", async () => {
        // §10.2's other delivery: the rescue point arrives rather than being
        // walked to (deliverCarried). The rescue row used to be built inside the
        // recap's 'move' case, so a victim delivered by a 'drive' left the feed
        // with nothing at all to show for it.
        const game = makeGame();
        const gs = game.specificGameState;
        gs.ruleset = 'experienced';
        const spot = perimeterNeighbours(gs.ambulance).find(space => space !== gs.engine)!;
        const carrier = gs.firefighters[1];
        carrier.space = spot;
        carrier.carrying = 'victim';
        gs.firefighters[0].space = gs.ambulance;
        game.initialSpecificGameState = cloneFiresOutState(gs);

        const drive = new FiresOutAction();
        drive.kind = 'drive';
        drive.vehicle = 'ambulance';
        drive.target = spot;
        await play(game, drive, gs.firefighters[0].ownerId);

        expect(gs.rescued).toBe(1);
        const events = await buildAllEvents(game, { ...NAMES });
        expect(events.map(event => event.title)).toContain("Alice rescued a victim! (1/7)");
    });

    it("computes result stats off the final state", async () => {
        const game = await playPassiveGame();
        const stats = computeFiresOutResultStats(game);

        // Every command in this passive game is an endTurn, so the count is exact.
        expect(stats.turnsLasted).toBe(game.gameState.commandHistory.length);
        expect(stats.ruleset).toBe('family');
        expect(stats.difficulty).toBe('recruit');
        expect(stats.rescued).toBe(game.specificGameState.rescued);
        expect(stats.lost).toBe(game.specificGameState.lost);
    });
});
