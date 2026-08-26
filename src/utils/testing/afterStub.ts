// Next's `after` — the post-response work every game route schedules — captured
// rather than run.
//
// Its own module, and deliberately a leaf: this is what the `vi.mock('next/server')`
// factory imports, and a factory whose own imports lead back to `next/server`
// deadlocks the module it is standing in for. So nothing here imports anything
// but vitest, and `utils/testing/apiRoute.ts` — which does hold a `next/server`
// import, for NextRequest — is imported by the tests instead.
//
// Test-only. Nothing under src/app imports this.

import { vi } from 'vitest';

const afterCallbacks: (() => unknown)[] = [];

/**
 * `next/server` with `after` captured. Pass to `vi.mock`.
 *
 * The real one throws outside a request scope, so a handler that schedules
 * post-response work can't be called at all without this. Capturing rather
 * than dropping is the useful half: `runAfterCallbacks` then runs that work
 * explicitly, the way the server does once the response has flushed.
 */
export async function nextServerStub() {
    const actual = await vi.importActual<typeof import('next/server')>('next/server');
    return { ...actual, after: (callback: () => unknown) => { afterCallbacks.push(callback); } };
}

/** Runs the post-response work the request(s) so far scheduled, and clears it. */
export async function runAfterCallbacks(): Promise<number> {
    const queued = afterCallbacks.splice(0);
    for (const callback of queued) {
        await callback();
    }
    return queued.length;
}

/** Drops anything still queued, so one test's work can't run inside the next. */
export function clearAfterCallbacks() {
    afterCallbacks.length = 0;
}
