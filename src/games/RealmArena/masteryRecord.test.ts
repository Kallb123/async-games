import { afterEach, describe, expect, it, vi } from "vitest";
import { GameResultModel, RESULT_COUNTS_FILTER } from "@/utils/mongodb/GameResultData";
import { masteryOf, masterySnapshotOf, SNAPSHOT_TIME_LIMIT_MS, SNAPSHOT_WAIT_MS } from "./masteryRecord";

// A player's mastery, summed from their Realm Arena results (§23.3) with Mongo
// stubbed out: the pipeline's shape is checked, and the rows it hands back
// are turned into XP and ranks.

const group = (userId: string, character: string, battles: number, attacks = 0, abilities = 0, items = 0) =>
    ({ _id: { userId, character }, battles, attacks, abilities, items });

const aggregateReturning = (rows: unknown[]) => vi.spyOn(GameResultModel, "aggregate").mockResolvedValue(rows as never);

afterEach(() => {
    vi.restoreAllMocks();
});

describe("masteryOf", () => {
    it("reads only the party's Realm Arena battles that count as played and count for stats, through the playerIds + gameType index", async () => {
        const aggregate = aggregateReturning([]);

        await masteryOf(["a", "b"]);

        const [pipeline] = aggregate.mock.calls[0] as unknown as [Record<string, unknown>[]];
        expect(pipeline[0]).toEqual({ $match: { playerIds: { $in: ["a", "b"] }, gameType: "RealmArena", countsAsPlayed: { $ne: false }, ...RESULT_COUNTS_FILTER } });
        // Only the party's own rows are summed, not their opponents'.
        expect(pipeline[1]).toEqual({ $project: { _id: 0, row: { $filter: { input: "$stats.mastery", cond: { $in: ["$$this.userId", ["a", "b"]] } } } } });
    });

    it("turns each player's record with each character into XP", async () => {
        aggregateReturning([group("a", "knight", 3, 10, 2, 1), group("a", "archer", 1), group("b", "mage", 2, 0, 4)]);

        const mastery = await masteryOf(["a", "b"]);

        expect(mastery.get("a")).toEqual({
            knight: { battles: 3, attacks: 10, abilities: 2, items: 1, xp: 6 + 30 + 10 + 3 },
            archer: { battles: 1, attacks: 0, abilities: 0, items: 0, xp: 2 },
        });
        expect(mastery.get("b")).toEqual({ mage: { battles: 2, attacks: 0, abilities: 4, items: 0, xp: 24 } });
    });

    it("skips a character that's no longer in the game", async () => {
        aggregateReturning([group("a", "dragon", 50, 50)]);
        expect((await masteryOf(["a"])).size).toBe(0);
    });

    it("asks nothing of the database for nobody", async () => {
        const aggregate = aggregateReturning([]);
        expect((await masteryOf([])).size).toBe(0);
        expect(aggregate).not.toHaveBeenCalled();
    });
});

describe("masterySnapshotOf", () => {
    it("keeps each player's ranks above 0, and nobody with none", async () => {
        // 22 XP is rank 0, 62 rank 1, 200 rank 2.
        aggregateReturning([group("a", "knight", 1, 5, 1), group("a", "archer", 1, 20), group("a", "mage", 10, 60), group("b", "cleric", 1)]);

        expect(await masterySnapshotOf(["a", "b"])).toEqual({ a: { archer: 1, mage: 2 } });
    });

    it("gives the lookup a time limit of its own", async () => {
        const aggregate = aggregateReturning([]);
        await masterySnapshotOf(["a"]);
        const [, options] = aggregate.mock.calls[0] as unknown as [unknown, unknown];
        expect(options).toEqual({ maxTimeMS: SNAPSHOT_TIME_LIMIT_MS });
    });

    it("starts the battle with nobody ranked when the results can't be read", async () => {
        vi.spyOn(GameResultModel, "aggregate").mockRejectedValue(new Error("operation exceeded time limit") as never);
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect(await masterySnapshotOf(["a", "b"])).toEqual({});
    });

    it("doesn't wait on a driver that never answers, past its own deadline", async () => {
        vi.useFakeTimers();
        try {
            vi.spyOn(GameResultModel, "aggregate").mockReturnValue(new Promise(() => {}) as never);
            vi.spyOn(console, "warn").mockImplementation(() => {});
            const snapshot = masterySnapshotOf(["a"]);
            await vi.advanceTimersByTimeAsync(SNAPSHOT_WAIT_MS);
            expect(await snapshot).toEqual({});
        } finally {
            vi.useRealTimers();
        }
    });
});
