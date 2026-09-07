import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactionModel } from "@/utils/mongodb/ReactionData";
import { attachHistoryReactions, attachHistoryReactionsToEach } from "./historyReactions";

afterEach(() => {
    vi.restoreAllMocks();
});

/** Stubs ReactionModel.find to answer with `reactions`, asserting the query shape callers actually send. */
function stubReactions(reactions: { commandId: string, reaction: string }[]) {
    vi.spyOn(ReactionModel, "find").mockImplementation(((filter: Record<string, unknown>) => {
        const commandId = filter.commandId as { $in?: string[] };
        const ids = new Set(commandId.$in);
        return { exec: async () => reactions.filter(r => ids.has(r.commandId)) };
    }) as typeof ReactionModel.find);
}

describe("attachHistoryReactions", () => {
    it("attaches a line's reaction by its commandId", async () => {
        stubReactions([{ commandId: "cmd-1", reaction: "😱" }]);

        const result = await attachHistoryReactions("game_1", [
            { text: "Alice rolled a 6", actorId: "user_a", commandId: "cmd-1" },
        ]);

        expect(result).toEqual([{ text: "Alice rolled a 6", actorId: "user_a", commandId: "cmd-1", reaction: "😱" }]);
    });

    it("attaches null to a line with no reaction", async () => {
        stubReactions([]);

        const result = await attachHistoryReactions("game_1", [
            { text: "Alice rolled a 6", actorId: "user_a", commandId: "cmd-1" },
        ]);

        expect(result[0].reaction).toBeNull();
    });

    it("attaches null to a line with no commandId, without querying for it", async () => {
        const find = vi.spyOn(ReactionModel, "find");

        const result = await attachHistoryReactions("game_1", [{ text: "Setup: re-roll on a 6 is enabled" }]);

        expect(result[0].reaction).toBeNull();
        expect(find).not.toHaveBeenCalled();
    });
});

describe("attachHistoryReactionsToEach", () => {
    it("keeps a reaction on its line across every snapshot it appears in", async () => {
        stubReactions([{ commandId: "cmd-1", reaction: "Nice!" }]);
        const line = { text: "Alice rolled a 6", actorId: "user_a", commandId: "cmd-1" };

        const [early, late] = await attachHistoryReactionsToEach("game_1", [[line], [line, line]]);

        expect(early[0].reaction).toBe("Nice!");
        expect(late.every(entry => entry.reaction === "Nice!")).toBe(true);
    });
});
