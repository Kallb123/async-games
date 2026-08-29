import { describe, expect, it, vi } from "vitest";
import { rollOffTurnOrder } from "./rollOff";

vi.mock("./DiceRoll", () => ({ DiceRoll: vi.fn() }));
import { DiceRoll } from "./DiceRoll";

/** Hands out the given rolls in order, so a roll-off is something a test can assert. */
function rolling(...rolls: number[]) {
    const queue = [...rolls];
    vi.mocked(DiceRoll).mockImplementation(() => queue.shift()!);
}

describe("rollOffTurnOrder", () => {
    it("orders players highest roll first", () => {
        rolling(2, 6, 4);

        const { turnOrder } = rollOffTurnOrder(["u1", "u2", "u3"], 6);

        expect(turnOrder).toEqual(["u2", "u3", "u1"]);
    });

    it("re-rolls a tie among only the tied players", () => {
        rolling(5, 5, 1, /* re-roll */ 2, 6);

        const { turnOrder } = rollOffTurnOrder(["u1", "u2", "u3"], 6);

        expect(turnOrder).toEqual(["u2", "u1", "u3"]);
    });

    it("names players by token so the setup log survives a rename", () => {
        rolling(6, 3);

        const { history } = rollOffTurnOrder(["u1", "u2"], 6);

        expect(history.map(entry => entry.text)).toEqual([
            "Setup: {{u1}} rolled a 6 and goes first",
            "Setup: {{u2}} rolled a 3",
        ]);
        // Nobody acted — these are setup lines, not anyone's move.
        expect(history.every(entry => entry.actorId === undefined)).toBe(true);
    });

    it("records the re-roll it had to run", () => {
        rolling(4, 4, 5, 2);

        const { history } = rollOffTurnOrder(["u1", "u2"], 6);

        expect(history[0].text).toBe("Setup: {{u1}} & {{u2}} rolled a 4 and are re-rolling");
    });
});
