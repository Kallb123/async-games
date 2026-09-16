/**
 * A deadline for something that isn't a `fetch`.
 *
 * `fetch` has `AbortSignal.timeout` (see `REQUEST_TIMEOUT_MS`), and every
 * request in the app uses it. Everything else that can take an unbounded amount
 * of time — a Mongo lookup behind a driver that sits in its own 30s server
 * selection, a Clerk SDK call that accepts and then never answers — has no such
 * thing, and an `await` on one of those stops whatever is waiting on it for as
 * long as it likes. Two places needed exactly this, which is why it lives here
 * rather than a third time in the next one.
 *
 * Runs `work()`, and answers with `fallback` if it hasn't finished within
 * `budgetMs` — or if it fails, at any point, including after the deadline has
 * already passed and its answer is no longer wanted. That last part is the
 * subtle one: the failure is caught on the work itself rather than on the race,
 * so a rejection that arrives late is logged rather than surfacing as an
 * unhandled rejection with nothing to attribute it to.
 *
 * The timer is always cleared, so work that answers straight away doesn't leave
 * one behind on every call.
 */
export async function withTimeout<T>(work: () => Promise<T>, budgetMs: number, fallback: T, label: string): Promise<T> {
    const settled = (async () => work())().catch((error: unknown) => {
        console.error(`${label} failed`, error);
        return fallback;
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), budgetMs); });
    try {
        return await Promise.race([settled, expired]);
    } finally {
        clearTimeout(timer);
    }
}
