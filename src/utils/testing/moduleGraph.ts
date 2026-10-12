// Walk the modules a file pulls in at runtime, for the guard tests that ask
// "what does this entry point actually reach?".
//
// Two guards ask it, about opposite halves of the app. serverModuleGraph.test.ts
// checks that no API route reaches a `'use client'` module, and
// achievements.test.ts checks that the browser-shipped achievement catalogue
// reaches nothing server-only (Mongoose, Clerk's server SDK). Both fail the same
// quiet way: it builds, it typechecks, and it breaks in front of a player — a
// client reference that throws when a route calls it, or a database driver in
// the browser bundle. A check on a file's own imports isn't enough for either,
// because the offender is usually two hops down (`achievements.ts -> ./rules.ts
// -> ./XModels.ts`), so both walk the whole graph. The walker started out inside
// the first guard; the second needs it too, and needs it to follow `./cards` as
// well as `@/…`, which a game file imports far more often than the alias. So
// this is the one copy, for the usual reason (walkFiles.ts, apiRoutes.ts).
//
// What counts as "at runtime": whatever the compiler leaves in. `import type`
// and `export type … from` are erased, so they can't call anything and aren't
// followed. A dynamic `import()` is not followed either — none of the guards
// that use this want to chase a lazy chunk.
//
// Test-only. Nothing under src/app imports this.

import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The alias `@/…` points here; also what the guards print their chains relative to. */
export const SRC_ROOT = path.join(process.cwd(), "src");

// One pattern per way a module names another at runtime, joined into a single
// scan so the specifiers come back in source order. Each captures the specifier
// as its one group. `[^;'"]` keeps the lazy import clause from running past the
// statement it began in when a file leaves its semicolons off.
const RUNTIME_IMPORT = new RegExp([
    // import a from "x";  import { a, b } from "x";  import * as a from "x";
    `import\\s+(?!type\\s)[^;'"]*?from\\s*['"]([^'"]+)['"]`,
    // import "x";  (registers adapters as a side effect, loads a stylesheet)
    `import\\s*['"]([^'"]+)['"]`,
    // export * from "x";  export * as a from "x";  export { a } from "x";
    // A barrel pulls in everything behind it, so a re-export is an import.
    `export\\s+(?:\\*(?:\\s+as\\s+\\w+)?|\\{[^}]*\\})\\s*from\\s*['"]([^'"]+)['"]`,
].map(pattern => `^(?:${pattern})`).join("|"), "gm");

/**
 * Every specifier a module names at runtime, as written: `@/…`, `./…` and
 * `../…`, and bare packages (`mongoose`, `@clerk/nextjs/server`) too.
 *
 * Bare packages are returned so a guard can ask "does anything reached import
 * mongoose?" — `reachableFrom` can't answer that, because a package isn't a
 * file in this tree and is never followed.
 */
export function runtimeImports(file: string): string[] {
    return [...readFileSync(file, "utf8").matchAll(RUNTIME_IMPORT)]
        .map(match => match.slice(1).find(specifier => specifier !== undefined)!);
}

/** Whether a module opens with the `'use client'` directive. */
export function isClientModule(file: string): boolean {
    return /^\s*['"]use client['"]/.test(readFileSync(file, "utf8"));
}

/**
 * The file a specifier names, from the file importing it — or undefined for a
 * bare package, and for anything that doesn't resolve to a file here.
 *
 * `@/…` is relative to src/, `./` and `../` to the importing file's own folder,
 * and the same four suffixes the compiler tries are tried in the same order.
 */
export function resolveImport(specifier: string, importer: string): string | undefined {
    let base: string;
    if (specifier.startsWith("@/")) base = path.join(SRC_ROOT, specifier.slice("@/".length));
    else if (specifier.startsWith("./") || specifier.startsWith("../")) base = path.resolve(path.dirname(importer), specifier);
    else return undefined;
    return ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
        .map(suffix => `${base}${suffix}`)
        .find(candidate => { try { return statSync(candidate).isFile(); } catch { return false; } });
}

/**
 * Every module the given entry point reaches, each mapped to the import chain
 * that got there — so a failure names the hop to fix, not just the endpoint.
 * Files only: a bare package is left for `runtimeImports` to report.
 */
export function reachableFrom(entry: string): Map<string, string[]> {
    const chains = new Map<string, string[]>([[entry, [entry]]]);
    const queue = [entry];
    while (queue.length) {
        const current = queue.shift()!;
        for (const specifier of runtimeImports(current)) {
            const next = resolveImport(specifier, current);
            if (!next || chains.has(next)) continue;
            chains.set(next, [...chains.get(current)!, next]);
            queue.push(next);
        }
    }
    return chains;
}
