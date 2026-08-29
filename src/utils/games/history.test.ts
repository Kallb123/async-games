import { describe, expect, it } from "vitest";
import { playerHistory, resolveHistory, userToken } from "./history";
import { UNKNOWN_PLAYER_NAME } from "@/utils/ui/players";

const NAMES = { user_a: "Alice", user_b: "Bob" };

describe("userToken", () => {
    it("delimits the id so the resolver knows where it ends", () => {
        expect(userToken("user_a")).toBe("{{user_a}}");
    });
});

describe("resolveHistory", () => {
    it("swaps a token for its name and keeps the actor", () => {
        expect(resolveHistory([{ text: "{{user_a}} drew a card", actorId: "user_a" }], NAMES))
            .toEqual([{ text: "Alice drew a card", actorId: "user_a" }]);
    });

    it("resolves every mention on a line", () => {
        expect(resolveHistory([{ text: "{{user_a}} stole from {{user_b}}" }], NAMES))
            .toEqual([{ text: "Alice stole from Bob" }]);
    });

    it("leaves a line nobody is named in alone", () => {
        expect(resolveHistory([{ text: "Setup: re-roll on a 6 is enabled" }], NAMES))
            .toEqual([{ text: "Setup: re-roll on a 6 is enabled" }]);
    });

    it("does not rescan a substituted name", () => {
        // Alice has renamed herself to something that looks like a token. A
        // resolver that ran a second pass would substitute it.
        expect(resolveHistory([{ text: "{{user_a}} won" }], { user_a: "{{user_b}}", user_b: "Bob" }))
            .toEqual([{ text: "{{user_b}} won" }]);
    });

    it("copies the fields it knows and nothing else", () => {
        // What a Mongoose subdocument looks like to a spread: internals as own
        // properties, the fields themselves on the prototype.
        const stored = Object.assign(
            Object.create({ text: "{{user_a}} won", actorId: "user_a" }),
            { $__parent: { specificGameState: { secretCode: [3, 1, 4, 1] } } },
        );

        const resolved = resolveHistory([stored], NAMES);

        expect(resolved).toEqual([{ text: "Alice won", actorId: "user_a" }]);
        expect(JSON.stringify(resolved)).not.toContain("secretCode");
    });

    it("names an id it cannot resolve rather than leaking it", () => {
        // A guest swept seven days after their last game.
        expect(resolveHistory([{ text: "{{user_gone}} passed" }], NAMES))
            .toEqual([{ text: `${UNKNOWN_PLAYER_NAME} passed` }]);
    });
});

describe("playerHistory", () => {
    it("writes the actor's mention and records who they are", () => {
        expect(playerHistory("user_a", "rolled a 6"))
            .toEqual({ text: "{{user_a}} rolled a 6", actorId: "user_a" });
    });
});
