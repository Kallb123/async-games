import { useResettingState } from "./useResettingState";

/**
 * A choice half-made on a board — a card or an action picked, and the tile it
 * lands on still to be tapped. Falls back to nothing whenever `turnKey`
 * changes, so a pick never lingers into somebody else's turn, and whenever the
 * board moves under it (docs/out-of-turn-actions.md §5.8).
 *
 * The second is what a game with out-of-turn plays needs. Its board polls on
 * the viewer's own turn, so a teammate's interrupt can land between the two
 * taps: the poll repaints the board, the `expectedCommandCount` the submit
 * hook sends catches up with it, and a second tap would send a choice made on
 * the old board without the server ever refusing it. Clearing the pick when
 * `commandCount` changes makes the player choose again on the board in front
 * of them. Nothing else moves `commandCount` except a command, and the
 * viewer's own already clear the pick they were sent from.
 */
export function useArmedPick<T>(turnKey: string, commandCount: number | undefined): [T | null, (next: T | null) => void] {
    return useResettingState<T | null>(null, `${turnKey}:${commandCount ?? ''}`);
}
