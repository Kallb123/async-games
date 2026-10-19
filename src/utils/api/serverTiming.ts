import { AsyncLocalStorage } from 'node:async_hooks';

// The request whose work is running, so a helper several calls down (the Clerk
// name lookup, inside every game's model file) can report to it without a
// timer being passed through all of them. Set by `time()` for the span's work.
const current = new AsyncLocalStorage<ServerTiming>();

// When this instance loaded, and when it last began a timed request: wall-clock
// time, since a function frozen between requests may not count the freeze on a
// monotonic clock, and the freeze is the thing being measured.
const loadedAt = Date.now();
let lastRequestAt: number | undefined;

/** Runs `work` as a span called `name`: a request's `ServerTiming.time`, or `untimed` where nothing is listening. */
export type TimeSpan = <T>(name: string, work: () => Promise<T>) => Promise<T>;
export const untimed: TimeSpan = (_name, work) => work();

export class ServerTiming {
  private readonly started = performance.now();
  private readonly entries: { name: string; duration: number }[] = [];
  // Work reported from below rather than wrapped in `time()`, summed per name.
  private readonly totals = new Map<string, number>();
  private nameCounts: { hits: number; misses: number } | null = null;

  constructor() {
    // How long the instance sat unused before this request (`idle`), or, on
    // its first, that it is new (`instance_new`, how long since it loaded):
    // what a slow first query after a quiet spell is checked against.
    const now = Date.now();
    this.entries.push(lastRequestAt === undefined
      ? { name: 'instance_new', duration: now - loadedAt }
      : { name: 'idle', duration: now - lastRequestAt });
    lastRequestAt = now;
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
/** Adds `duration` to the span `name` of the request this runs inside; does nothing outside one. */
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
