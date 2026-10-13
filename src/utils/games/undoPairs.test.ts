import { describe, expect, it } from "vitest";
import type { IGameCommand } from "../apiModels/gameCommand";
import { pairUndos, undoneIds } from "./undoPairs";

const command = (id: string, className = "TestMove") => ({ id, className }) as unknown as IGameCommand;
const undo = (id: string) => command(id, "TestUndo");

describe("pairUndos", () => {
    it("pairs an undo with the command just before it", () => {
        expect([...pairUndos([command("a"), command("b"), undo("u")])]).toEqual([["u", "b"]]);
    });

    it("lets undos in a row each take the next command back", () => {
        const pairs = pairUndos([command("a"), command("b"), command("c"), undo("u1"), undo("u2")]);
        expect(pairs.get("u1")).toBe("c");
        expect(pairs.get("u2")).toBe("b");
    });

    it("pairs a command played after an undo with the next undo, not the one before it", () => {
        const pairs = pairUndos([command("a"), undo("u1"), command("b"), undo("u2")]);
        expect(pairs.get("u1")).toBe("a");
        expect(pairs.get("u2")).toBe("b");
    });

    it("takes nothing back when nothing stands", () => {
        expect(pairUndos([undo("u")]).get("u")).toBeUndefined();
        expect(pairUndos([command("a"), undo("u1"), undo("u2")]).get("u2")).toBeUndefined();
    });
});

describe("undoneIds", () => {
    it("is every undo and every command one took back", () => {
        expect(undoneIds([command("a"), command("b"), undo("u"), command("c")])).toEqual(new Set(["b", "u"]));
    });

    it("is just the undo when it had nothing to take back", () => {
        expect(undoneIds([undo("u")])).toEqual(new Set(["u"]));
    });

    it("is empty for a log with no undo", () => {
        expect(undoneIds([command("a"), command("b")]).size).toBe(0);
    });
});
