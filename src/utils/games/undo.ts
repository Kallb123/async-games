// The pieces of docs/undo.md that are the same in every game that takes a move
// back. Everything a rules judgement decides — which commands push, whether a
// hold follows, what the snapshot is — stays in each game (§16).

/**
 * How long a turn that is ready to end is held open for its own undo window
 * (docs/undo.md §5) before the board ends it on its own. One constant for
 * every game, so the countdown means the same thing wherever it appears.
 */
export const UNDO_WINDOW_MS = 10_000;

/**
 * One snapshot on a game's undo stack, for a game with no turn-timeout adapter
 * (Train Time, Dice Cities): its turn timer passes an expired turn on by
 * stepping `currentTurn` and restarting the clock, with no command of the
 * game's own. So besides who pushed it, an entry records `turnStartedAt` — the
 * game's `lastTurnTimestamp` when it was pushed — and a turn the timer moved
 * on leaves it stale even though no command ran to move the anchor.
 */
export interface IClockedUndoEntry<State> {
    by: string;
    turnStartedAt: string;
    state: State;
}

/**
 * The snapshot `userId` can still take back, or null (docs/undo.md §4): theirs,
 * pushed by the very last command played, in the turn that is still running.
 * `lastCommandId` is the tail of commandHistory and `turnStartedAt` the game's
 * `lastTurnTimestamp`, which every hand-off moves on — the command route's and
 * the turn timer's alike.
 */
export function liveUndoEntry<State>(
    gs: { undoStack?: IClockedUndoEntry<State>[]; undoAnchorId?: string | null },
    userId: string | null,
    lastCommandId: string | null,
    turnStartedAt: string,
): IClockedUndoEntry<State> | null {
    // Absent (`?? []`) on a game that predates the stack.
    const entry = (gs.undoStack ?? []).at(-1);
    if (!entry || entry.by !== userId) return null;
    if (lastCommandId === null || gs.undoAnchorId !== lastCommandId) return null;
    if (entry.turnStartedAt !== turnStartedAt) return null;
    return entry;
}
