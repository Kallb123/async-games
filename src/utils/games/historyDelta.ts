import type { IHistoryEntry } from "./history";

// The timeline's history, sent once rather than once per snapshot.
//
// Every snapshot on a reconstructed timeline carries the whole match history up
// to that point, so sent as-is the timeline response grows with the square of
// the game's length — a long Realm Arena battle runs to hundreds of steps, each
// carrying every line before it. But a snapshot's history is almost always the
// one before it with a line or two unshifted on top, so each one is sent as
// just that difference, and the client stitches the full logs back together.
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
