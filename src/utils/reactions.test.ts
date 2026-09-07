import { describe, expect, it } from "vitest";
import { viewerReaction } from "./reactions";

describe("viewerReaction", () => {
    it("picks the viewer's own reaction out of everyone's", () => {
        const reactions = [
            { reaction: "😱", actorId: "user_a", actorUsername: "Alice" },
            { reaction: "Nice!", actorId: "user_b", actorUsername: "Bob" },
        ];

        expect(viewerReaction(reactions, "user_a")).toBe("😱");
        expect(viewerReaction(reactions, "user_b")).toBe("Nice!");
    });

    it("never returns another player's reaction — this is a recap screen's only redaction", () => {
        // The regression this guards: swapping the lookup for `[0]`, or any
        // change that stops filtering by actorId, would leak an opponent's
        // reaction onto the viewer's own recap row.
        const reactions = [{ reaction: "🤔", actorId: "user_a", actorUsername: "Alice" }];

        expect(viewerReaction(reactions, "user_c")).toBeNull();
    });

    it("returns null when nobody reacted or the event carries no reactions at all", () => {
        expect(viewerReaction([], "user_a")).toBeNull();
        expect(viewerReaction(undefined, "user_a")).toBeNull();
    });
});
