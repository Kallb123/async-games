import { describe, expect, it } from "vitest";

import { playableOutOfTurn } from "../gameCommand";
import type { ICommandOutcome, IGameCommand } from "../gameCommand";
import type { uuidString } from "../GameDataApi";
import { deserializeJSON, serializable } from "../Serialisable";
import "../GameLogic";

// docs/out-of-turn-actions.md §5.1: a command may be played off its sender's
// turn only when its *class* says so. These are test-only classes, registered
// in this file alone, so nothing here reaches a real game's command list.

class TestCommandBase implements IGameCommand {
    id = "11111111-1111-1111-1111-111111111111" as uuidString;
    timestamp = "2026-01-01T00:00:00.000Z";
    gameId = "game_1" as uuidString;
    senderId = "user_a";
    senderUsername = "a";
    readonly className: string = "TestCommandBase";

    myString() {
        return this.className;
    }

    async Execute(): Promise<ICommandOutcome> {
        return { validMove: true, turnOver: false };
    }
}

@serializable
class TestDeclaresOutOfTurn extends TestCommandBase {
    readonly className: string = "TestDeclaresOutOfTurn";
    readonly playableOutOfTurn = true;
}

@serializable
class TestInheritsOutOfTurn extends TestDeclaresOutOfTurn {
    readonly className: string = "TestInheritsOutOfTurn";
}

@serializable
class TestGetterOutOfTurn extends TestCommandBase {
    readonly className: string = "TestGetterOutOfTurn";
    get playableOutOfTurn() {
        return true;
    }
}

@serializable
class TestOnTurnOnly extends TestCommandBase {
    readonly className: string = "TestOnTurnOnly";
}

@serializable
class TestDeclaresSomethingElse extends TestCommandBase {
    readonly className: string = "TestDeclaresSomethingElse";
    // Truthy, but not the declaration: only `true` counts.
    readonly playableOutOfTurn = "true";
}

describe("playableOutOfTurn", () => {
    it("is true for a class that declares it, however it declares it", () => {
        expect(playableOutOfTurn(new TestDeclaresOutOfTurn())).toBe(true);
        expect(playableOutOfTurn(new TestInheritsOutOfTurn())).toBe(true);
        expect(playableOutOfTurn(new TestGetterOutOfTurn())).toBe(true);
    });

    it("is false for a class that doesn't", () => {
        expect(playableOutOfTurn(new TestOnTurnOnly())).toBe(false);
        expect(playableOutOfTurn(new TestDeclaresSomethingElse())).toBe(false);
    });

    it("ignores the flag when a request body claims it for a class that doesn't declare it", () => {
        // The shape of the hole §3 closed: the reviver copies every posted
        // property onto the rehydrated instance, so the instance says whatever
        // the body said. The class is the only thing asked.
        const forged: IGameCommand = deserializeJSON(JSON.stringify({
            className: "SnakesAndLaddersRequestDiceRoll",
            gameId: "game_1",
            senderId: "user_a",
            playableOutOfTurn: true,
        }));

        expect((forged as unknown as Record<string, unknown>).playableOutOfTurn).toBe(true);
        expect(playableOutOfTurn(forged)).toBe(false);
    });

    it("ignores a body that tries to name its own constructor", () => {
        // `constructor` is one of the keys the reviver refuses to copy
        // (Serialisable.ts), so the class that answers is the one the
        // registry really built.
        const forged: IGameCommand = deserializeJSON(JSON.stringify({
            className: "TestOnTurnOnly",
            constructor: { playableOutOfTurn: true },
            playableOutOfTurn: true,
        }));

        expect(forged).toBeInstanceOf(TestOnTurnOnly);
        expect(playableOutOfTurn(forged)).toBe(false);
    });

    it("keeps a declaring class's answer through a round trip", () => {
        const rehydrated: IGameCommand = deserializeJSON(JSON.stringify(new TestDeclaresOutOfTurn()));

        expect(playableOutOfTurn(rehydrated)).toBe(true);
    });

    it("is false for a plain object, whatever it carries", () => {
        // A body whose className isn't registered comes back as a plain
        // object; the route refuses it before this, but the helper must not
        // be the thing that says yes.
        expect(playableOutOfTurn({ playableOutOfTurn: true } as unknown as IGameCommand)).toBe(false);
        expect(playableOutOfTurn(Object.create(null) as IGameCommand)).toBe(false);
    });
});
