/**
 * Pairs each of a screen's data fetches with the browser's own record of it
 * (its `PerformanceResourceTiming`), which is where its size and its time on
 * the wire come from.
 *
 * The record is handed to a resource observer some time after the body lands —
 * before or after the screen hands the fetch over — so whichever arrives
 * second does the pairing. Records are kept here rather than read back with
 * `getEntriesByName`: the resource timing buffer holds 250 entries and then
 * takes no more, which a polling tab reaches, while an observer is handed
 * every one.
 */
export interface ApiEntryMatcher<Entry extends { name: string; startTime: number }> {
  /** A record the observer was handed. */
  arrived(entry: Entry): void;
  /** The record of the request to `name` begun at or after `since`, or nothing if it doesn't arrive within the wait. */
  find(name: string, since: number): Promise<Entry | undefined>;
}

export function apiEntryMatcher<Entry extends { name: string; startTime: number }>({ keep = 30, waitMs = 3000 } = {}): ApiEntryMatcher<Entry> {
  // Records no fetch has asked for yet, oldest first, and fetches still waiting for theirs.
  const recent: Entry[] = [];
  const waiting: { name: string; since: number; resolve: (entry?: Entry) => void }[] = [];
  const matches = (entry: Entry, name: string, since: number) => entry.name === name && entry.startTime >= since;

  return {
    arrived(entry) {
      const index = waiting.findIndex(({ name, since }) => matches(entry, name, since));
      if (index >= 0) {
        waiting.splice(index, 1)[0].resolve(entry);
        return;
      }
      recent.push(entry);
      if (recent.length > keep) recent.shift();
    },
    find(name, since) {
      for (let i = recent.length - 1; i >= 0; i--) {
        if (matches(recent[i], name, since)) return Promise.resolve(recent.splice(i, 1)[0]);
      }
      return new Promise(resolve => {
        const waiter = { name, since, resolve };
        waiting.push(waiter);
        setTimeout(() => {
          const index = waiting.indexOf(waiter);
          if (index >= 0) { waiting.splice(index, 1); resolve(undefined); }
        }, waitMs);
      });
    },
  };
}
