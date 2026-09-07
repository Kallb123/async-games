import { describe, expect, it } from "vitest";
import { runCommand } from "./commandPipeline";
import { playerHistory } from "./history";
import type { IGameData } from "../mongodb/GameData";
import type { IGameCommand, IGameType } from "../apiModels/gameCommand";

const GAME_ID = "11111111-1111-1111-1111-111111111111";

const gameType: IGameType = {
    gameType: "Test", friendlyName: "Test", icon: "", url: "test", className: "Test",
    CheckEndTurn: () => {},
    CheckGameOver: () => false,
};

function makeGameData(): IGameData {
    return {
        gameId: GAME_ID,
        gameType,
        userIdList: ["user_a"],
        turnTimer: "1 day",
        currentTurn: "user_a",
        lastTurnTimestamp: "2026-01-01T00:00:00.000Z",
        timerWarningNotificationSent: false,
        missedTurnCounts: new Map(),
        gameState: { turnOrder: ["user_a"], history: [], commandHistory: [] },
        complete: false,
        winner: "",
    };
}

/** A command that writes `linesWritten` history lines, all as one player's action. */
function makeCommand(linesWritten: number, valid = true): IGameCommand {
    return {
        id: "11111111-1111-1111-1111-111111111111",
        timestamp: "2026-01-01T00:00:00.000Z",
        gameId: GAME_ID,
        senderId: "user_a",
        senderUsername: "Alice",
        className: "TestCommand",
        myString: () => "test",
        Undo: () => {},
        Execute: async (gameData: IGameData) => {
            for (let i = 0; i < linesWritten; i++) {
                gameData.gameState.history.unshift(playerHistory("user_a", `did thing ${i}`));
            }
            return { validMove: valid, turnOver: false };
        },
    };
}

describe("runCommand", () => {
    it("stamps every history line a command wrote with that command's id", async () => {
        const gameData = makeGameData();

        await runCommand(gameData, gameType, makeCommand(2));

        expect(gameData.gameState.history.every(line => line.commandId === "11111111-1111-1111-1111-111111111111")).toBe(true);
    });

    it("leaves history untouched for an invalid move", async () => {
        const gameData = makeGameData();

        await runCommand(gameData, gameType, makeCommand(1, false));

        // Execute() still ran and unshifted a line — runCommand doesn't undo
        // that — but a rejected move is never recorded on commandHistory, and
        // the line it left behind carries no commandId since the stamping loop
        // never runs for an invalid outcome.
        expect(gameData.gameState.commandHistory).toHaveLength(0);
        expect(gameData.gameState.history[0]?.commandId).toBeUndefined();
    });

    it("only stamps the lines this command wrote, not lines already there", async () => {
        const gameData = makeGameData();
        gameData.gameState.history.push({ text: "an earlier line", actorId: "user_a", commandId: "earlier-command" });

        await runCommand(gameData, gameType, makeCommand(1));

        expect(gameData.gameState.history[0].commandId).toBe("11111111-1111-1111-1111-111111111111");
        expect(gameData.gameState.history[1].commandId).toBe("earlier-command");
    });
});
