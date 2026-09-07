import { describe, expect, it } from "vitest";
import { addReaction, viewerReaction } from "./reactions";

describe("viewerReaction", () => {
    it("picks the viewer's own reaction out of everyone's", () => {
        const reactions = [
            { reaction: "😱", actorId: "user_a", actorUsername: "Alice" },
            { reaction: "Nice!", actorId: "user_b", actorUsername: "Bob" },
        ];

        expect(viewerReaction(reactions, "user_a")).toBe("😱");
        expect(viewerReaction(reactions, "user_b")).toBe("Nice!");
    });

    it("never returns another player's reaction as the viewer's own", () => {
        // The regression this guards: swapping the lookup for `[0]`, or any
        // change that stops filtering by actorId, would give ReactionRow
        // someone else's reaction to render as the viewer's interactive slot.
        const reactions = [{ reaction: "🤔", actorId: "user_a", actorUsername: "Alice" }];

        expect(viewerReaction(reactions, "user_c")).toBeNull();
    });

    it("returns null when nobody reacted or the event carries no reactions at all", () => {
        expect(viewerReaction([], "user_a")).toBeNull();
        expect(viewerReaction(undefined, "user_a")).toBeNull();
    });
});

describe("addReaction", () => {
    it("appends to an existing list without disturbing the others", () => {
        const existing = [{ reaction: "😱", actorId: "user_a", actorUsername: "Alice" }];

        expect(addReaction(existing, "user_b", "Nice!")).toEqual([
            { reaction: "😱", actorId: "user_a", actorUsername: "Alice" },
            { reaction: "Nice!", actorId: "user_b", actorUsername: "" },
        ]);
        // The original array is untouched — callers hand this straight to a
        // setState updater, which must never mutate the previous state.
        expect(existing).toHaveLength(1);
    });

    it("starts a fresh list when the line had no reactions yet", () => {
        expect(addReaction(undefined, "user_a", "🤔")).toEqual([{ reaction: "🤔", actorId: "user_a", actorUsername: "" }]);
    });
});
