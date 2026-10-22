// The work behind scripts/sync-indexes.ts, kept apart from the script so a test
// can run it over stand-in models with no database.
//
// It does what Mongoose's `autoCreate` + `autoIndex` did when a model was
// compiled, and nothing more: create the model's collection if it isn't there,
// then create the indexes its schema declares if they aren't. It never calls
// `syncIndexes()` and never drops an index — an index someone built by hand, or
// that an older deploy still reads, is left exactly where it is.

/** The slice of a Mongoose model this needs. */
export interface SyncableModel {
    modelName: string;
    collection: { collectionName: string };
    schema: { indexes(): unknown[] };
    createCollection(): Promise<unknown>;
    createIndexes(): Promise<unknown>;
}

export interface ModelSyncResult {
    model: string;
    collection: string;
    /** How many indexes the schema declares for this model (a discriminator's own, not its base's). */
    indexes: number;
    ms: number;
    /** Set when this model could not be brought up to date. */
    error?: string;
}

/** The server's "NamespaceExists": the collection is already there, which is the usual case. */
const isCollectionExists = (error: unknown) =>
    typeof error === 'object' && error !== null && ((error as { code?: unknown }).code === 48 || (error as { codeName?: unknown }).codeName === 'NamespaceExists');

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Create one model's collection and indexes. Never throws: a failure comes back on the result. */
export async function syncModelIndexes(model: SyncableModel): Promise<ModelSyncResult> {
    const started = Date.now();
    const result: ModelSyncResult = {
        model: model.modelName,
        collection: model.collection.collectionName,
        indexes: model.schema.indexes().length,
        ms: 0,
    };
    try {
        try {
            await model.createCollection();
        } catch (error) {
            if (!isCollectionExists(error)) throw error;
        }
        // Mongoose skips an index a base schema already declares, so a
        // discriminator builds only its own and the shared collection's
        // indexes are built once, by the base model.
        await model.createIndexes();
    } catch (error) {
        result.error = errorMessage(error);
    }
    result.ms = Date.now() - started;
    return result;
}

const describe = (result: ModelSyncResult) => {
    const what = `${result.model} -> ${result.collection}`;
    return result.error
        ? `FAILED ${what}: ${result.error} (${result.ms} ms)`
        : `ok     ${what}: collection ensured, ${result.indexes} declared index${result.indexes === 1 ? '' : 'es'} (${result.ms} ms)`;
};

/**
 * Sync every model, a few at a time — the commands are round trips to the
 * database, and a build that runs this shouldn't spend a minute of them in a
 * line. Models that share a collection (the discriminators) are safe to run
 * together: creating a collection that exists, or an index that exists, is a
 * no-op on the server.
 *
 * One model failing doesn't stop the rest, so one run reports everything that
 * is wrong. Results come back in the order the models were given.
 */
export async function syncAllIndexes(
    models: SyncableModel[],
    { concurrency = 4, log = console.log }: { concurrency?: number; log?: (line: string) => void } = {},
): Promise<{ results: ModelSyncResult[]; ms: number }> {
    const started = Date.now();
    const results: ModelSyncResult[] = new Array(models.length);
    let next = 0;
    const worker = async () => {
        while (next < models.length) {
            const index = next++;
            results[index] = await syncModelIndexes(models[index]);
            log(describe(results[index]));
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, models.length) }, worker));
    return { results, ms: Date.now() - started };
}
