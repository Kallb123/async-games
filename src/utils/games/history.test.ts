import { describe, expect, it } from "vitest";
import { historyText, resolveHistory, resolveStoredHistory, userToken } from "./history";
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

    it("names an id it cannot resolve rather than leaking it", () => {
        // A guest swept seven days after their last game.
        expect(resolveHistory([{ text: "{{user_gone}} passed" }], NAMES))
            .toEqual([{ text: `${UNKNOWN_PLAYER_NAME} passed` }]);
    });
});

describe("resolveStoredHistory", () => {
    it("resolves a line stored before its game was converted", () => {
        expect(resolveStoredHistory(["user_a rolled a 6"], NAMES))
            .toEqual([{ text: "Alice rolled a 6" }]);
    });

    it("takes both shapes in one log", () => {
        expect(resolveStoredHistory([{ text: "{{user_b}} won", actorId: "user_b" }, "user_a rolled a 6"], NAMES))
            .toEqual([{ text: "Bob won", actorId: "user_b" }, { text: "Alice rolled a 6" }]);
    });

    it("prefers the longest matching id in a legacy line", () => {
        expect(resolveStoredHistory(["user_ab won"], { user_a: "Alice", user_ab: "Abe" }))
            .toEqual([{ text: "Abe won" }]);
    });

    it("does not rescan a name substituted into a legacy line", () => {
        expect(resolveStoredHistory(["user_a won"], { user_a: "user_b", user_b: "Bob" }))
            .toEqual([{ text: "user_b won" }]);
    });
});

describe("historyText", () => {
    it("reads either shape", () => {
        expect(historyText("Alice won")).toBe("Alice won");
        expect(historyText({ text: "Alice won" })).toBe("Alice won");
    });
});
