import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * The commands a game's logic file declares `readonly undoable = true` on
 * (docs/undo.md §6), read off its source rather than its exports so an undo
 * test fails the day somebody opts a draw in without meaning to. `testUrl` is
 * the calling test's `import.meta.url`; `logicFile` sits beside it.
 */
export function undoableCommandsIn(testUrl: string, logicFile: string): string[] {
    const source = readFileSync(path.join(path.dirname(fileURLToPath(testUrl)), logicFile), "utf8");
    const found: string[] = [];
    for (const match of source.matchAll(/export class (\w+) implements IGameCommand \{([\s\S]*?)myString\(/g)) {
        if (/readonly undoable = true/.test(match[2])) found.push(match[1]);
    }
    return found;
}
