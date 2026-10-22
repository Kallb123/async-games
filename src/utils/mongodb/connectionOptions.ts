// What `mongoose.connect` is told, kept apart from mongodb.ts so a script or a
// test can read it without opening anything.

/**
 * Mongoose builds no collection and no index by itself.
 *
 * By default every model, the moment it is compiled, calls `Model.init()`:
 * once the connection is up, a `createCollection` and then a `createIndex` per
 * index, for each of the fifty-odd models and discriminators the app registers. On a
 * new serverless instance that is a burst of a hundred or so commands the
 * instant the first connection opens (`instrumentation.ts` starts it at boot),
 * it grows the pool to its `maxConnecting`, and the request that woke the
 * instance queues its own indexed reads behind all of it — 1.6 s for a read
 * that takes 15 ms on a warm instance. Indexes are a property of the
 * deployment, not of a lambda starting, so they are built once per deploy by
 * `npm run db:indexes` (scripts/sync-indexes.ts), which the Vercel build runs
 * ahead of `next build` and the E2E workflow runs ahead of the app.
 *
 * These are connection options, not `mongoose.set(...)`: `Model.init()` reads
 * them lazily, after the connection opens (it awaits the connect before it
 * decides whether to create the collection, and looks up `autoIndex` only
 * after that), so they take effect for models compiled before `connect` runs,
 * which is every model here. The sync script passes them too, so that the
 * `init()` of each model it imports doesn't race the explicit work it does.
 */
export const NO_AUTO_BUILD = {
  autoIndex: false,
  autoCreate: false,
} as const;

/** The options the app's runtime connection (`dbConnect`) is opened with. */
export const RUNTIME_CONNECT_OPTIONS = {
  bufferCommands: false,
  ...NO_AUTO_BUILD,
  // A request fires its reads in parallel (dashboard, board), and on a new
  // instance each needs a fresh handshake; the driver default lets only two
  // handshake at once. No minPoolSize: connect() doesn't wait for it, and
  // the driver holds it against every replica-set member, so it would
  // only keep idle sockets open on the secondaries we never read from.
  maxConnecting: 3,
} as const;
