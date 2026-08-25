/**
 * Runs once when a server instance starts, before it handles its first
 * request (Next's instrumentation hook).
 *
 * Opening the Mongo connection is the slowest thing a cold instance does, and
 * until this existed the request that paid for it was whichever one arrived
 * first. For most of the app that is someone already using it, mid-session,
 * who won't notice — but the request that lands on a genuinely cold instance
 * most reliably is a crawler unfurling a freshly shared join link, or the
 * friend who tapped it. Neither of them is waiting around: a preview that
 * arrives late is a preview that never appears.
 *
 * So the connection is started here instead, at boot, and deliberately not
 * awaited — `dbConnect` caches the in-flight promise, so whoever needs it
 * first awaits whatever is left of a handshake that began before they knocked,
 * rather than starting one. A failure here is not fatal: every caller still
 * awaits `dbConnect` itself and handles its own failure, so this only ever
 * moves the wait, never the outcome.
 */
export async function register() {
    // Only the Node runtime has a database. The hook also runs for the edge
    // runtime, where importing mongoose would fail.
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    const { dbConnect } = await import('@/utils/mongodb/mongodb');
    void dbConnect().catch(error => console.error('Warm-up connection failed; the first request will retry.', error));
}
