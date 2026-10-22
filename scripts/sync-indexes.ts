// Builds every collection and index the app's models declare, in whatever
// database MONGODB_URI names:
//
//   MONGODB_URI=… npm run db:indexes
//
// The app's own connection builds nothing (src/utils/mongodb/connectionOptions.ts
// says why), so this is the one place an index comes to exist. It runs on every
// Vercel build, ahead of `next build` (the `vercel-build` script), so the
// indexes a deploy's code relies on exist before that code serves a request;
// and in the E2E workflow, ahead of the app, against the e2e database.
//
// It only ever adds. For each model it creates the collection if it is missing
// and the schema's indexes if they are missing — what Mongoose's autoCreate and
// autoIndex did — and never drops or changes one, so it is safe to run as often
// as you like, against production included. An index whose options differ from
// the schema's already-built one is reported and fails the run: it needs a
// person to decide between the two.
//
// Exits non-zero if it can't reach the database or any model fails.

import mongoose from 'mongoose';
import { NO_AUTO_BUILD } from '@/utils/mongodb/connectionOptions';
// Every model the app registers. A model that file doesn't import is a model
// this never builds an index for: src/utils/mongodb/models.test.ts guards that.
import { registeredModels } from '@/utils/mongodb/models';
import { clearRateLimitsForIndexing } from '@/utils/mongodb/RateLimitData';
import { syncAllIndexes } from './lib/syncIndexes';

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('Set MONGODB_URI to the database to build indexes in.');

    // Fail in seconds, not the driver's thirty, when the cluster can't be
    // reached (an IP access list that doesn't admit the build, a paused
    // cluster): this runs inside a deploy.
    // NO_AUTO_BUILD: each model's own init() would otherwise start the same
    // work as soon as the connection opens, racing the explicit pass below.
    await mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 20_000, ...NO_AUTO_BUILD });

    const models = registeredModels();
    console.log(`Building collections and indexes for ${models.length} models.`);
    const { results, ms } = await syncAllIndexes(models, { preparations: { RateLimit: () => clearRateLimitsForIndexing() } });

    const failed = results.filter(result => result.error);
    console.log(`${results.length - failed.length} of ${results.length} models up to date in ${ms} ms.`);
    if (failed.length > 0) {
        console.error(`${failed.length} failed: ${failed.map(result => result.model).join(', ')}`);
        process.exitCode = 1;
    }
}

main()
    .catch(error => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
