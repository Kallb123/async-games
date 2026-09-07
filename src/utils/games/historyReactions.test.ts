import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactionModel } from "@/utils/mongodb/ReactionData";
import { attachHistoryReactions, attachHistoryReactionsToEach } from "./historyReactions";

afterEach(() => {
    vi.restoreAllMocks();
});

/** Stubs ReactionModel.find to answer with `reactions`, asserting the query shape callers actually send. */
function stubReactions(reactions: { commandId: string, reaction: string, actorId?: string, actorUsername?: string }[]) {
    vi.spyOn(ReactionModel, "find").mockImplementation(((filter: Record<string, unknown>) => {
        const commandId = filter.commandId as { $in?: string[] };
        const ids = new Set(commandId.$in);
        return { exec: async () => reactions.filter(r => ids.has(r.commandId)) };
    }) as typeof ReactionModel.find);
}

describe("attachHistoryReactions", () => {
    it("attaches a line's reaction by its commandId", async () => {
        stubReactions([{ commandId: "cmd-1", reaction: "😱", actorId: "user_b", actorUsername: "Bob" }]);

        const result = await attachHistoryReactions("game_1", [
            { text: "Alice rolled a 6", actorId: "user_a", commandId: "cmd-1" },
        ]);

        expect(result).toEqual([{
            text: "Alice rolled a 6",
            actorId: "user_a",
            commandId: "cmd-1",
            reactions: [{ reaction: "😱", actorId: "user_b", actorUsername: "Bob" }],
        }]);
    });

    it("attaches an empty list to a line with no reaction", async () => {
        stubReactions([]);

        const result = await attachHistoryReactions("game_1", [
            { text: "Alice rolled a 6", actorId: "user_a", commandId: "cmd-1" },
        ]);

        expect(result[0].reactions).toEqual([]);
    });

    it("attaches an empty list to a line with no commandId, without querying for it", async () => {
        const find = vi.spyOn(ReactionModel, "find");

        const result = await attachHistoryReactions("game_1", [{ text: "Setup: re-roll on a 6 is enabled" }]);

        expect(result[0].reactions).toEqual([]);
        expect(find).not.toHaveBeenCalled();
    });

    it("keeps every player's reaction on a line more than one of them reacted to", async () => {
        stubReactions([
            { commandId: "cmd-1", reaction: "😱", actorId: "user_b", actorUsername: "Bob" },
            { commandId: "cmd-1", reaction: "Nice!", actorId: "user_c", actorUsername: "Cara" },
        ]);

        const result = await attachHistoryReactions("game_1", [
            { text: "Alice rolled a 6", actorId: "user_a", commandId: "cmd-1" },
        ]);

        expect(result[0].reactions).toEqual([
            { reaction: "😱", actorId: "user_b", actorUsername: "Bob" },
            { reaction: "Nice!", actorId: "user_c", actorUsername: "Cara" },
        ]);
    });
});

describe("attachHistoryReactionsToEach", () => {
    it("keeps a reaction on its line across every snapshot it appears in", async () => {
        stubReactions([{ commandId: "cmd-1", reaction: "Nice!", actorId: "user_b", actorUsername: "Bob" }]);
        const line = { text: "Alice rolled a 6", actorId: "user_a", commandId: "cmd-1" };

        const [early, late] = await attachHistoryReactionsToEach("game_1", [[line], [line, line]]);

        expect(early[0].reactions).toEqual([{ reaction: "Nice!", actorId: "user_b", actorUsername: "Bob" }]);
        expect(late.every(entry => entry.reactions?.length === 1)).toBe(true);
    });
});
