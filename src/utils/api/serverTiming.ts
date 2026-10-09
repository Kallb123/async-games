import { AsyncLocalStorage } from 'node:async_hooks';

// The request whose work is running, so a helper several calls down (the Clerk
// name lookup, inside every game's model file) can report to it without a
// timer being passed through all of them. Set by `time()` for the span's work.
const current = new AsyncLocalStorage<ServerTiming>();

/** Runs `work` as a span called `name`: a request's `ServerTiming.time`, or `untimed` where nothing is listening. */
export type TimeSpan = <T>(name: string, work: () => Promise<T>) => Promise<T>;
export const untimed: TimeSpan = (_name, work) => work();

export class ServerTiming {
  private readonly started = performance.now();
  private readonly entries: { name: string; duration: number }[] = [];
  private nameLookups: { duration: number; hits: number; misses: number } | null = null;
  async time<T>(name: string, work: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await current.run(this, work); } finally { this.entries.push({ name, duration: performance.now() - start }); }
  }
  /** Adds one player-name lookup: how long it took and how many ids it served from memory or fetched. */
  addNameLookup({ duration, hits, misses }: { duration: number; hits: number; misses: number }) {
    const total = this.nameLookups ??= { duration: 0, hits: 0, misses: 0 };
    total.duration += duration; total.hits += hits; total.misses += misses;
  }
  header(): string {
    // `names` is nested inside whichever span the lookup ran in (`response` on
    // a game, `player_directory` on the dashboard), not taken out of it, so
    // those keep meaning what they did before and `names` reads as their
    // Clerk share. Lookups running side by side add up, so it can exceed the
    // span they overlap in. The hit/miss counts are a `desc` rather than a
    // `dur`, and counts only: never the ids or names behind them.
    const lookups = this.nameLookups;
    const all = [...this.entries, ...(lookups ? [{ name: 'names', duration: lookups.duration }] : []),
      { name: 'total', duration: performance.now() - this.started }];
    const spans = all.map(({ name, duration }) => `${name};dur=${duration.toFixed(1)}`);
    if (lookups) spans.push(`names_cache;desc="hit=${lookups.hits} miss=${lookups.misses}"`);
    return spans.join(', ');
  }
}
/** Reports a name lookup to the request it is part of; does nothing outside one (a cron, a test). */
export function recordNameLookup(lookup: { duration: number; hits: number; misses: number }) {
  current.getStore()?.addNameLookup(lookup);
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
