import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../..");

// Every argument passed to gameState.history.push/unshift, with the file and
// line it came from. Balances brackets rather than matching to the first `)`,
// so a multi-line call or a nested template literal is read whole.
function historyWrites(source: string, file: string): { file: string, line: number, argument: string }[] {
    const writes: { file: string, line: number, argument: string }[] = [];
    const call = /gameState\.history\.(?:push|unshift)\(/g;

    let match: RegExpExecArray | null;
    while ((match = call.exec(source)) !== null) {
        let depth = 1;
        let i = match.index + match[0].length;
        while (i < source.length && depth > 0) {
            if (source[i] === "(") depth++;
            else if (source[i] === ")") depth--;
            i++;
        }
        writes.push({
            file,
            line: source.slice(0, match.index).split("\n").length,
            argument: source.slice(match.index + match[0].length, i - 1),
        });
    }
    return writes;
}

const gameSources = globSync("games/*/*.ts", { cwd: srcRoot })
    .filter(file => !file.endsWith(".test.ts"));

const writes = gameSources.flatMap(file => historyWrites(readFileSync(path.join(srcRoot, file), "utf8"), file));

// A history line is stored once and read forever, so it must not bake in a
// player's name — it stores a {{userId}} token and resolves it per request (see
// history.ts). Nothing in the type system holds that line: a game can write
// `{ text: `${this.senderUsername} rolled a ${roll}` }` and it type-checks,
// compiles, and quietly goes stale the first time that player renames.
//
// So this is the same kind of source-scan guard as the serializable registry
// and the recorded-randomness one: it reads what every game actually passes to
// history.push/unshift and insists the player in it is an id.
describe("every history write", () => {
    it("found the write sites to check", () => {
        // Guards the guard: a refactor that moved or renamed these calls would
        // otherwise leave this file passing over nothing at all.
        expect(writes.length).toBeGreaterThan(50);
        expect(new Set(writes.map(write => write.file)).size).toBeGreaterThanOrEqual(8);
    });

    it.each(writes.map(write => [`${write.file}:${write.line}`, write.argument]))(
        "names its players by id, not by name (%s)",
        (_where, argument) => {
            // playerHistory(senderId, …) tokenises for you; anything else has
            // to be an entry literal that names nobody by a resolved name.
            if (argument.trimStart().startsWith("playerHistory(")) return;

            expect(argument).not.toMatch(/senderUsername|[Uu]sername(?:Map|List)?\b/);
        },
    );
});
