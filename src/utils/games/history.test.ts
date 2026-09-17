import { describe, expect, it } from "vitest";
import { asStoredHistory, playerHistory, resolveHistory, userToken } from "./history";
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

    it("carries a line's commandId through, so a reaction can still find it", () => {
        expect(resolveHistory([{ text: "{{user_a}} rolled a 6", actorId: "user_a", commandId: "cmd-1" }], NAMES))
            .toEqual([{ text: "Alice rolled a 6", actorId: "user_a", commandId: "cmd-1" }]);
    });
});

describe("playerHistory", () => {
    it("writes the actor's mention and records who they are", () => {
        expect(playerHistory("user_a", "rolled a 6"))
            .toEqual({ text: "{{user_a}} rolled a 6", actorId: "user_a" });
    });
});

describe("a history line's timestamp on the way out", () => {
    it("is truncated to the minute it fell in", () => {
        // Every reader renders these through formatRelativeTime ("just now",
        // "5m ago"), so the seconds show nowhere — and sending them lets an
        // opponent measure the gap between two lines. A command a game generated
        // in answer to another lands milliseconds later; one a player tapped
        // lands however long they took. That gap says which just happened.
        const resolved = resolveHistory(
            [{ text: "{{u1}} ended their turn", createdAt: "2026-09-15T10:00:37.412Z" }],
            { u1: "Alice" },
        );

        expect(resolved[0].createdAt).toBe("2026-09-15T10:00:00.000Z");
    });

    it("leaves a stamp it can't read alone rather than dropping it", () => {
        const resolved = resolveHistory([{ text: "x", createdAt: "not a date" }], {});

        expect(resolved[0].createdAt).toBe("not a date");
    });
});

describe("asStoredHistory", () => {
    it("flips a setup block into the order the log is stored in", () => {
        // Written the way it reads: the roll-off, then what the host turned on.
        const setup = [
            { text: "Setup: {{user_a}} rolled a 6 and goes first" },
            { text: "Setup: {{user_b}} rolled a 2" },
            { text: "Setup: first to 10 victory points wins" },
        ];

        // Stored newest line first, like every unshift a command makes — so the
        // log reads back in the order it was written once it is reversed for
        // display, rather than the roll-off coming out backwards.
        expect(asStoredHistory(setup).map(entry => entry.text)).toEqual([
            "Setup: first to 10 victory points wins",
            "Setup: {{user_b}} rolled a 2",
            "Setup: {{user_a}} rolled a 6 and goes first",
        ]);
    });

    it("leaves the block it was handed alone", () => {
        const setup = [{ text: "one" }, { text: "two" }];

        asStoredHistory(setup);

        expect(setup.map(entry => entry.text)).toEqual(["one", "two"]);
    });
});
