import { describe, expect, it } from "vitest";
import { syncAllIndexes, syncModelIndexes, type SyncableModel } from "./syncIndexes";

// A stand-in for a Mongoose model that records what it was asked to do.
function fakeModel(
    name: string,
    { indexes = 1, createCollection, createIndexes }: { indexes?: number; createCollection?: () => Promise<unknown>; createIndexes?: () => Promise<unknown> } = {},
) {
    const calls: string[] = [];
    const model: SyncableModel = {
        modelName: name,
        collection: { collectionName: `${name.toLowerCase()}s` },
        schema: { indexes: () => new Array(indexes).fill([{}, {}]) },
        createCollection: async () => { calls.push("createCollection"); return createCollection?.(); },
        createIndexes: async () => { calls.push("createIndexes"); return createIndexes?.(); },
    };
    return { model, calls };
}

describe("syncModelIndexes", () => {
    it("creates the collection, then its indexes, and nothing else", async () => {
        const { model, calls } = fakeModel("Thing", { indexes: 3 });
        const result = await syncModelIndexes(model);
        expect(calls).toEqual(["createCollection", "createIndexes"]);
        expect(result).toMatchObject({ model: "Thing", collection: "things", indexes: 3 });
        expect(result.error).toBeUndefined();
    });

    it("carries on when the collection already exists", async () => {
        const { model, calls } = fakeModel("Thing", {
            createCollection: () => Promise.reject(Object.assign(new Error("Collection already exists"), { code: 48 })),
        });
        const result = await syncModelIndexes(model);
        expect(calls).toEqual(["createCollection", "createIndexes"]);
        expect(result.error).toBeUndefined();
    });

    it("reports any other failure to create the collection, and builds no index after it", async () => {
        const { model, calls } = fakeModel("Thing", { createCollection: () => Promise.reject(new Error("not authorized")) });
        const result = await syncModelIndexes(model);
        expect(calls).toEqual(["createCollection"]);
        expect(result.error).toBe("not authorized");
    });

    it("reports an index that conflicts with one already built", async () => {
        const { model } = fakeModel("Thing", { createIndexes: () => Promise.reject(new Error("An existing index has the same name")) });
        expect((await syncModelIndexes(model)).error).toMatch(/same name/);
    });
});

describe("syncAllIndexes", () => {
    it("syncs every model, in the order given, and carries on past a failure", async () => {
        const a = fakeModel("A");
        const b = fakeModel("B", { createIndexes: () => Promise.reject(new Error("boom")) });
        const c = fakeModel("C");
        const lines: string[] = [];
        const { results } = await syncAllIndexes([a.model, b.model, c.model], { concurrency: 2, log: line => lines.push(line) });
        expect(results.map(result => [result.model, result.error])).toEqual([["A", undefined], ["B", "boom"], ["C", undefined]]);
        expect(c.calls).toEqual(["createCollection", "createIndexes"]);
        expect(lines).toHaveLength(3);
        expect(lines.filter(line => line.startsWith("FAILED"))).toHaveLength(1);
    });

    it("has nothing to do for no models", async () => {
        expect((await syncAllIndexes([])).results).toEqual([]);
    });

    it("never runs more models at once than it was allowed", async () => {
        let running = 0;
        let peak = 0;
        const slow = () => async () => {
            running++;
            peak = Math.max(peak, running);
            await new Promise(resolve => setTimeout(resolve, 5));
            running--;
        };
        const models = Array.from({ length: 8 }, (_, i) => fakeModel(`M${i}`, { createIndexes: slow() }).model);
        await syncAllIndexes(models, { concurrency: 3, log: () => {} });
        expect(peak).toBeLessThanOrEqual(3);
    });
});
