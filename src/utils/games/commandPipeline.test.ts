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

    it("stamps createdAt from the command's own timestamp, not the moment it runs", async () => {
        // buildTimeline replays a game's commands into a fresh in-memory history
        // every time a player opens match review, long after they were actually
        // played. Stamping from wall-clock time here would make every line read
        // "just now" on replay — see commandPipeline.ts.
        const gameData = makeGameData();

        await runCommand(gameData, gameType, makeCommand(1));

        expect(gameData.gameState.history[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
    });
});

// A game can answer one command with another (ICommandOutcome.followUpCommand) —
// Settlements & Cities ends a turn that way when its player can no longer afford
// anything, so that the ending is an ordinary end-turn command rather than a
// distinguishable event. These pin the contract the pipeline offers it, because
// the whole point is that the follow-up behaves like any other command and the
// only thing keeping it bounded is this file.
describe("a command that asks for a follow-up", () => {
    /** A command whose outcome names `followUp`, and which ends the turn if `turnOver`. */
    function asking(followUp: IGameCommand | undefined, turnOver = false, id = "trigger"): IGameCommand {
        return {
            ...makeCommand(1),
            id: id as IGameCommand["id"],
            className: "Trigger",
            Execute: async () => ({ validMove: true, turnOver, followUpCommand: followUp }),
        };
    }

    function plain(id: string, turnOver = true): IGameCommand {
        return { ...makeCommand(1), id: id as IGameCommand["id"], className: "FollowUp",
            Execute: async () => ({ validMove: true, turnOver }) };
    }

    it("runs it, records it after its trigger, and marks it as that trigger's", async () => {
        const gameData = makeGameData();
        const { outcome } = await runCommand(gameData, gameType, asking(plain("follow")));

        expect(gameData.gameState.commandHistory.map(c => (c as IGameCommand).className))
            .toEqual(["Trigger", "FollowUp"]);
        // The mark is what lets a replay tell the recorded copy from the one it
        // would regenerate; `recorded…` so the route strips a client's attempt.
        expect((gameData.gameState.commandHistory[1] as unknown as Record<string, unknown>).recordedFollowUpToId)
            .toBe("trigger");
        // The caller is told the turn passed without being told which half did it…
        expect(outcome.turnOver).toBe(true);
        // …and never handed the command object itself.
        expect(outcome.followUpCommand).toBeUndefined();
    });

    it("lets each command keep its own step, in order", async () => {
        const gameData = makeGameData();
        const steps: string[] = [];
        await runCommand(gameData, gameType, asking(plain("follow")), {
            onStep: applied => steps.push(applied.className),
        });

        expect(steps).toEqual(["Trigger", "FollowUp"]);
    });

    it("ignores one asked for by a command that already passed the turn", async () => {
        // CheckEndTurn has run by then, so the follow-up would land on whoever
        // holds the dice now rather than the player who asked for it.
        const gameData = makeGameData();
        await runCommand(gameData, gameType, asking(plain("follow"), true));

        expect(gameData.gameState.commandHistory.map(c => (c as IGameCommand).className)).toEqual(["Trigger"]);
    });

    it("ignores one asked for by a follow-up, so the chain is always two long", async () => {
        const gameData = makeGameData();
        const second = asking(plain("third"), false, "second");
        await runCommand(gameData, gameType, asking(second, false, "first"));

        expect(gameData.gameState.commandHistory.map(c => (c as IGameCommand).id))
            .toEqual(["first", "second"]);
    });

    it("keeps the trigger but reports a refusal, so a caller stops asking for more", async () => {
        const gameData = makeGameData();
        const refused: IGameCommand = { ...makeCommand(1), className: "FollowUp",
            Execute: async () => ({ validMove: false, turnOver: false }) };
        const result = await runCommand(gameData, gameType, asking(refused));

        expect(result.outcome.validMove).toBe(true);
        expect(result.followUpRefused).toBe(true);
        expect(gameData.gameState.commandHistory.map(c => (c as IGameCommand).className)).toEqual(["Trigger"]);
    });

    it("skips it entirely when the trigger ended the game", async () => {
        const gameData = makeGameData();
        const endsIt: IGameType = { ...gameType, CheckGameOver: () => true };
        const { gameOver } = await runCommand(gameData, endsIt, asking(plain("follow")));

        expect(gameOver).toBe(true);
        expect(gameData.gameState.commandHistory.map(c => (c as IGameCommand).className)).toEqual(["Trigger"]);
    });
});
