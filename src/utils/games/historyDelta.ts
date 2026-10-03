import type { IHistoryEntry } from "./history";

// The timeline's history, sent once rather than once per snapshot.
//
// Every snapshot on a reconstructed timeline carries the whole match history up
// to that point, so sent as-is the timeline response grows with the square of
// the game's length. But a snapshot's history is almost always the one before
// it with a line or two unshifted on top, so the timeline route sends each one
// as just that difference, and useTurnNavigation stitches the full logs back
// together.
//
// History is newest-first, so what two neighbouring snapshots share is a tail.
// A delta is what this snapshot puts in front of that tail (`added`), and how
// many of the previous snapshot's front lines it no longer has (`dropped`) —
// an undo taking its lines back off, say. Nothing assumes a history only ever
// grows: a line changed anywhere just means everything in front of it is
// resent, so decoding always gives back exactly what was encoded.

/** One snapshot's history, as the change from the snapshot before it. */
export interface IHistoryDelta<TEntry extends IHistoryEntry = IHistoryEntry> {
    /** Lines at the front of this history that the previous one doesn't end with. Newest first. */
    added: TEntry[];
    /** How many lines at the front of the previous history this one no longer has. */
    dropped: number;
}

/** Each history as a delta from the one before it — the first from an empty log. */
export function toHistoryDeltas<TEntry extends IHistoryEntry>(histories: TEntry[][]): IHistoryDelta<TEntry>[] {
    // A line is compared by its whole serialised form, so a field added to
    // IHistoryEntry later is compared too, without anyone remembering to.
    let previous: string[] = [];
    return histories.map((history) => {
        const keys = history.map((entry) => JSON.stringify(entry));
        let shared = 0;
        while (
            shared < keys.length &&
            shared < previous.length &&
            keys[keys.length - 1 - shared] === previous[previous.length - 1 - shared]
        ) {
            shared++;
        }
        const delta = { added: history.slice(0, history.length - shared), dropped: previous.length - shared };
        previous = keys;
        return delta;
    });
}

/** The full histories back from toHistoryDeltas' deltas. Unchanged lines are the same objects throughout. */
export function fromHistoryDeltas<TEntry extends IHistoryEntry>(deltas: IHistoryDelta<TEntry>[]): TEntry[][] {
    let previous: TEntry[] = [];
    return deltas.map(({ added, dropped }) => {
        previous = [...added, ...previous.slice(dropped)];
        return previous;
    });
}

/** Anything carrying a history — a timeline snapshot, on either side of the wire. */
type WithHistory<TEntry extends IHistoryEntry> = { history: TEntry[] };

/** A snapshot as the timeline route sends it: its history swapped for the delta from the one before. */
export type WithHistoryDelta<TSnapshot extends WithHistory<TEntry>, TEntry extends IHistoryEntry = TSnapshot["history"][number]> =
    Omit<TSnapshot, "history"> & { historyDelta: IHistoryDelta<TEntry> };

/** The timeline's snapshots as the route sends them. */
export function withHistoryDeltas<TSnapshot extends WithHistory<TEntry>, TEntry extends IHistoryEntry>(
    snapshots: TSnapshot[],
): WithHistoryDelta<TSnapshot, TEntry>[] {
    const deltas = toHistoryDeltas(snapshots.map((snapshot) => snapshot.history));
    return snapshots.map(({ history: _history, ...snapshot }, i) => ({ ...snapshot, historyDelta: deltas[i] }));
}

/**
 * The timeline's snapshots as the client reads them, with every history in
 * full. A response that already has them — from a deployment that predates
 * deltas, still serving while a new one rolls out — is taken as it is.
 */
export function withFullHistories<TSnapshot extends WithHistory<TEntry>, TEntry extends IHistoryEntry>(
    snapshots: (WithHistoryDelta<TSnapshot, TEntry> | TSnapshot)[],
): TSnapshot[] {
    if (snapshots.every((snapshot) => "history" in snapshot)) return snapshots as TSnapshot[];
    const sent = snapshots as WithHistoryDelta<TSnapshot, TEntry>[];
    const histories = fromHistoryDeltas(sent.map((snapshot) => snapshot.historyDelta));
    return sent.map(({ historyDelta: _historyDelta, ...snapshot }, i) => ({ ...snapshot, history: histories[i] }) as unknown as TSnapshot);
}
