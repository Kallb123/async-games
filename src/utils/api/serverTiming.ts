import { AsyncLocalStorage } from 'node:async_hooks';

// Kept on `globalThis`, as `dbConnect` keeps its connection, because Next
// loads this module more than once per instance: `instrumentation.ts` opens
// the Mongo connection at boot from a bundle of its own, so the pool listeners
// `dbConnect` registers then hold that bundle's copy of this module, while the
// route handlers run requests in theirs. One store per instance means both
// copies see the same request.
//
// - `current`: the request whose work is running, so a helper several calls
//   down (the Clerk name lookup, inside every game's model file; the Mongo
//   pool's events) can report to it without a timer being passed through all
//   of them. Set by `time()` for the span's work.
// - `bootedAt`, `lastRequestAt`: when the instance first loaded this module (at
//   boot, from `instrumentation.ts`), and when it last served a signed-in
//   request. Wall-clock time, since a function frozen between requests may
//   not count the freeze on a monotonic clock, and the freeze is the thing
//   being measured.
declare global {
  var agServerTiming: { current: AsyncLocalStorage<ServerTiming>; bootedAt: number; lastRequestAt?: number } | undefined;
}
const instance = globalThis.agServerTiming ??= { current: new AsyncLocalStorage<ServerTiming>(), bootedAt: Date.now() };
const current = instance.current;
const MINUTE_MS = 60_000;
/** The beacon's cap on a time (`performanceValueLimit`): `instance_new` is clamped to it rather than dropped. */
const TIME_LIMIT_MS = 120_000;

/** Runs `work` as a span called `name`: a request's `ServerTiming.time`, or `untimed` where nothing is listening. */
export type TimeSpan = <T>(name: string, work: () => Promise<T>) => Promise<T>;
export const untimed: TimeSpan = (_name, work) => work();

export class ServerTiming {
  private readonly started = performance.now();
  private readonly entries: { name: string; duration: number }[] = [];
  // Work reported from below rather than wrapped in `time()`, summed per name.
  private readonly totals = new Map<string, number>();
  private nameCounts: { hits: number; misses: number } | null = null;

  /**
   * Notes how long the instance sat unused before this request (`idle`), or,
   * on its first, that it is new (`instance_new`, how long since it booted):
   * what a slow first query after a quiet spell is checked against. Call it
   * once the caller is signed in. The clock is the instance's, not the
   * caller's, so it says something about other players' requests: it is
   * rounded down to whole minutes, which separates a frozen instance from a
   * warm one without timing anyone's last request, and a signed-out caller
   * neither reads it nor resets it.
   */
  noteInstance() {
    const now = Date.now();
    this.entries.push(instance.lastRequestAt === undefined
      ? { name: 'instance_new', duration: Math.min(now - instance.bootedAt, TIME_LIMIT_MS) }
      : { name: 'idle', duration: Math.floor((now - instance.lastRequestAt) / MINUTE_MS) * MINUTE_MS });
    instance.lastRequestAt = now;
  }

  async time<T>(name: string, work: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await current.run(this, work); } finally { this.entries.push({ name, duration: performance.now() - start }); }
  }
  /** Adds `duration` to the span `name`, which is reported as the sum of everything added to it. */
  add(name: string, duration: number) {
    this.totals.set(name, (this.totals.get(name) ?? 0) + duration);
  }
  /** Adds one player-name lookup: how long it took and how many ids it served from memory or fetched. */
  addNameLookup({ duration, hits, misses }: { duration: number; hits: number; misses: number }) {
    this.add('names', duration);
    const counts = this.nameCounts ??= { hits: 0, misses: 0 };
    counts.hits += hits; counts.misses += misses;
  }
  header(): string {
    // `names` is nested inside whichever span the lookup ran in (`response` on
    // a game, `player_directory` on the dashboard), not taken out of it, so
    // those keep meaning what they did before and `names` reads as their
    // Clerk share. Lookups running side by side add up, so it can exceed the
    // span they overlap in. The hit/miss counts are a `desc` rather than a
    // `dur`, and counts only: never the ids or names behind them. The Mongo
    // pool's spans (see `dbConnect`) are summed and nested the same way.
    const counts = this.nameCounts;
    const all = [...this.entries, ...[...this.totals].map(([name, duration]) => ({ name, duration })),
      { name: 'total', duration: performance.now() - this.started }];
    const spans = all.map(({ name, duration }) => `${name};dur=${duration.toFixed(1)}`);
    if (counts) spans.push(`names_cache;desc="hit=${counts.hits} miss=${counts.misses}"`);
    return spans.join(', ');
  }
}
/** Reports a name lookup to the request it is part of; does nothing outside one (a cron, a test). */
export function recordNameLookup(lookup: { duration: number; hits: number; misses: number }) {
  current.getStore()?.addNameLookup(lookup);
}
/**
 * Adds `duration` to the span `name` of the request this runs inside; does
 * nothing outside one. It must never throw: the Mongo pool calls it from inside
 * the driver's wait-queue processing, which a throw would wedge.
 */
export function recordSpanTime(name: string, duration: number) {
  current.getStore()?.add(name, duration);
}
export function timedJson(body: unknown, timing: ServerTiming, init?: ResponseInit): Response {
  const serialise = performance.now();
  const json = JSON.stringify(body);
  const duration = performance.now() - serialise;
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Content-Length', String(new TextEncoder().encode(json).byteLength));
  headers.set('Server-Timing', `${timing.header()}, serialise;dur=${duration.toFixed(1)}`);
  return new Response(json, { ...init, headers });
}
