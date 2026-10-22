import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimitModel, clearRateLimitsForIndexing } from "./RateLimitData";

// The clean-up `npm run db:indexes` runs before it builds this collection's
// unique `key` and TTL indexes. No database: the model's queries are stubbed,
// and what is pinned is what it asks to delete.
function stub({ expired = 0, duplicatedKeys = [] as string[], duplicates = 0 } = {}) {
    const deleteMany = vi.spyOn(RateLimitModel, "deleteMany")
        .mockReturnValueOnce({ exec: async () => ({ deletedCount: expired }) } as never)
        .mockReturnValueOnce({ exec: async () => ({ deletedCount: duplicates }) } as never);
    const aggregate = vi.spyOn(RateLimitModel, "aggregate")
        .mockReturnValue({ exec: async () => duplicatedKeys.map(key => ({ _id: key })) } as never);
    return { deleteMany, aggregate };
}

describe("clearRateLimitsForIndexing", () => {
    afterEach(() => vi.restoreAllMocks());

    it("deletes every counter whose window is over, or that has no end, as the TTL would have", async () => {
        const now = new Date("2026-10-22T18:00:00Z");
        const { deleteMany } = stub({ expired: 3 });

        await clearRateLimitsForIndexing(now);

        expect(deleteMany.mock.calls[0][0]).toEqual({ $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }] });
    });

    it("then deletes every row of a key held more than once, which is what blocks the unique index", async () => {
        const { deleteMany } = stub({ expired: 1, duplicatedKeys: ["performance:user_1:1792309200000"], duplicates: 2 });

        const said = await clearRateLimitsForIndexing();

        expect(deleteMany).toHaveBeenCalledTimes(2);
        expect(deleteMany.mock.calls[1][0]).toEqual({ key: { $in: ["performance:user_1:1792309200000"] } });
        expect(said).toBe("cleared 1 expired and 2 duplicated counters");
    });

    it("deletes no live counter, and says nothing, on a collection already in order", async () => {
        const { deleteMany } = stub();

        expect(await clearRateLimitsForIndexing()).toBeUndefined();
        expect(deleteMany).toHaveBeenCalledTimes(1);
    });
});
