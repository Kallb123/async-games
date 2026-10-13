import type { IGameCommand } from "../apiModels/gameCommand";

// Which commands an undo takes back — the one pairing rule the shared recap
// (recap.ts) and a review's timeline (IReplayAdapter.omitUndoneSteps, replay.ts)
// both read, so it has one home. docs/undo.md §10.
//
// Every undo reverses the newest command still standing, and an undo is no
// command to stand: after one undo the next reaches one further back, hence a
// stack. An undo with nothing standing takes nothing back.

/** For each undo in `commands` (oldest first), by its id, the id of the command it takes back — undefined when nothing stood. */
export function pairUndos(commands: readonly IGameCommand[]): Map<string, string | undefined> {
    const pairs = new Map<string, string | undefined>();
    const standing: string[] = [];
    for (const command of commands) {
        // A game's undo command is named by convention: its class ends in `Undo`.
        if (command.className.endsWith("Undo")) {
            pairs.set(command.id, standing.pop());
        } else {
            standing.push(command.id);
        }
    }
    return pairs;
}

/** The id of every undo and of every command one took back — what a review has no step for. */
export function undoneIds(commands: readonly IGameCommand[]): Set<string> {
    const ids = new Set<string>();
    for (const [undoId, undoneId] of pairUndos(commands)) {
        ids.add(undoId);
        if (undoneId !== undefined) ids.add(undoneId);
    }
    return ids;
}
