import { describe, expect, it } from "vitest";
import { replaceHistoryUserIds } from "./history";

describe("replaceHistoryUserIds", () => {
    it("swaps an id for its name", () => {
        expect(replaceHistoryUserIds(["user_a drew a card"], { user_a: "Alice" }))
            .toEqual(["Alice drew a card"]);
    });

    it("leaves a line with no ids alone", () => {
        expect(replaceHistoryUserIds(["Setup: re-roll on a 6 is enabled"], { user_a: "Alice" }))
            .toEqual(["Setup: re-roll on a 6 is enabled"]);
    });

    it("does not rescan a substituted name", () => {
        // Alice's name contains Bob's id. A resolver that ran one replacement
        // over the output of the last would go on to substitute it.
        expect(replaceHistoryUserIds(["user_a won"], { user_a: "user_b", user_b: "Bob" }))
            .toEqual(["user_b won"]);
    });

    it("prefers the longest matching id", () => {
        expect(replaceHistoryUserIds(["user_ab won"], { user_a: "Alice", user_ab: "Abe" }))
            .toEqual(["Abe won"]);
    });

    it("replaces every mention on a line", () => {
        expect(replaceHistoryUserIds(["user_a stole from user_b"], { user_a: "Alice", user_b: "Bob" }))
            .toEqual(["Alice stole from Bob"]);
    });
});
