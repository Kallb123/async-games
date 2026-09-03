// The engine half of a forced turn: what `resolveStalledTurn` reports back
// when a game's own adapter *doesn't* finish the turn. Each game's own
// adapter is tested against its own rules (src/games/*/turnTimeout.test.ts);
// what these cover is the distinction the caller acts on, which no single
// game's adapter can reach both sides of — declining before anything ran, and
// getting stuck after something did.
//
// It matters because the two are persisted differently: the turntimer cron
// banks a missed turn against the abandon ladder for the first and throws the
// document away for the second, so a game that ran half a turn never has half
// a turn saved.

import { describe, expect, it } from "vitest";
import { registerTurnTimeoutAdapter, resolveStalledTurn } from "./turnTimeout";
import { SnakesAndLaddersGameType } from "@/games/SnakesAndLadders/SnakesAndLaddersLogic";
import type { ICommandOutcome, IGameCommand } from "@/utils/apiModels/gameCommand";
import type { IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";

// One command per call, from a script the test writes — so a test can say
// "one that works, then nothing left to do" and get the shape no real adapter
// can produce on demand. Registered against a real game type, because
// resolveStalledTurn re-serialises `gameData.gameType` before it runs
// anything; Snakes & Ladders registers no adapter of its own, and a test file
// gets its own module registry, so this can't reach another one's.
const scripted: (IGameCommand | null)[] = [];
registerTurnTimeoutAdapter({
    className: "SnakesAndLaddersGameType",
    buildTimeoutCommand: () => scripted.shift() ?? null,
});

function command(outcome: ICommandOutcome): IGameCommand {
    return {
        id: 'c', timestamp: '2026-01-01T00:00:00.000Z', gameId: 'g',
        senderId: 'u1', senderUsername: 'u1', className: 'ScriptedCommand',
        myString: () => 'scripted',
        Execute: async () => outcome,
        Undo: () => {},
    } as unknown as IGameCommand;
}

function makeGame(): IGameDataDocument {
    return {
        gameId: "g",
        gameType: new SnakesAndLaddersGameType(),
        currentTurn: "u1",
        userIdList: ["u1", "u2"],
        gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
        specificGameState: { playerPositions: new Map(), hasRolled: false, reRollOnSix: false },
        complete: false,
        winner: "",
        markModified: () => {},
    } as unknown as IGameDataDocument;
}

function commandHistory(game: IGameData): unknown[] {
    return game.gameState.commandHistory;
}

describe("resolveStalledTurn", () => {
    it("reports 'noAdapter' for a game type that registered nothing", async () => {
        const game = makeGame();
        (game as unknown as { gameType: { className: string } }).gameType.className = 'NoSuchGameType';

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe('noAdapter');
    });

    it("declines when the adapter has nothing to run at all", async () => {
        scripted.length = 0;
        const game = makeGame();

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe('declined');
        expect(commandHistory(game)).toEqual([]);
    });

    it("declines when the adapter's very first command is refused", async () => {
        // Nothing was accepted, so nothing of the turn is on commandHistory
        // and there is nothing to lose by saving the missed-turn count.
        scripted.length = 0;
        scripted.push(command({ validMove: false, turnOver: false }));
        const game = makeGame();

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe('declined');
        expect(commandHistory(game)).toEqual([]);
    });

    it("reports 'stuck' once a command has been accepted and the turn still doesn't end", async () => {
        // The half-resolved turn: one command landed on commandHistory and
        // then the adapter gave up. The caller must not persist this.
        scripted.length = 0;
        scripted.push(command({ validMove: true, turnOver: false }));
        const game = makeGame();

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe('stuck');
        expect(commandHistory(game)).toHaveLength(1);
    });

    it("advances as soon as a command ends the turn", async () => {
        scripted.length = 0;
        scripted.push(command({ validMove: true, turnOver: false }));
        scripted.push(command({ validMove: true, turnOver: true }));
        const game = makeGame();

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe('advanced');
        expect(commandHistory(game)).toHaveLength(2);
        expect(game.currentTurn).toBe("u2"); // the game type's own CheckEndTurn ran
    });

    it("stops at the command budget rather than looping forever", async () => {
        // A misbehaving adapter that never ends the turn: 'stuck', not a hang,
        // and not 20 commands' worth of consequences saved either.
        scripted.length = 0;
        for (let i = 0; i < 50; i++) scripted.push(command({ validMove: true, turnOver: false }));
        const game = makeGame();

        expect(await resolveStalledTurn(game, "u1", "Alice")).toBe('stuck');
        expect(commandHistory(game)).toHaveLength(20); // MAX_TIMEOUT_COMMANDS
    });
});
