import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { apiRouteFiles } from '@/utils/testing/apiRoutes';

// A `'use client'` module is a *client reference* in the server graph: importing
// a function out of one from a route handler hands you a proxy that throws
// "Attempted to call x() from the server but x is on the client" the moment you
// call it. It builds and typechecks cleanly, so nothing catches it before a
// request does — POST /api/lobby shipped a 500 this way, calling
// partySizeErrorMessage() when it still lived in PartySizeHint.tsx.
//
// So walk what each route handler actually reaches at runtime and fail on the
// first client module in the chain. A shared helper a route needs belongs in a
// plain module (src/utils/**), which the component can import too.

const SRC = join(process.cwd(), 'src');

const isClientModule = (path: string) =>
    /^\s*['"]use client['"]/.test(readFileSync(path, 'utf8'));

// The `@/…` specifiers a module pulls in at runtime. `import type` lines are
// erased by the compiler, so they can't call anything and don't count.
function runtimeImports(path: string): string[] {
    return [...readFileSync(path, 'utf8').matchAll(/^import\s+(?!type\s)[^;]*?from\s+['"](@\/[^'"]+)['"]/gm)]
        .map(match => match[1]);
}

function resolve(specifier: string): string | undefined {
    const base = join(SRC, specifier.slice('@/'.length));
    return ['.ts', '.tsx', '/index.ts', '/index.tsx']
        .map(suffix => `${base}${suffix}`)
        .find(candidate => { try { return statSync(candidate).isFile(); } catch { return false; } });
}

// Every module the given entry point reaches, each mapped to the import chain
// that got there — so a failure names the hop to fix, not just the endpoint.
function reachableFrom(entry: string): Map<string, string[]> {
    const chains = new Map<string, string[]>([[entry, [entry]]]);
    const queue = [entry];
    while (queue.length) {
        const current = queue.shift()!;
        for (const specifier of runtimeImports(current)) {
            const next = resolve(specifier);
            if (!next || chains.has(next)) continue;
            chains.set(next, [...chains.get(current)!, next]);
            queue.push(next);
        }
    }
    return chains;
}

describe('API route handlers', () => {
    const routes = apiRouteFiles();

    it('finds the route handlers to check', () => {
        expect(routes.length).toBeGreaterThan(10);
    });

    it.each(routes.map(route => [relative(SRC, route), route]))(
        'never reaches a client module: %s',
        (_name, route) => {
            const offenders = [...reachableFrom(route)]
                .filter(([path]) => isClientModule(path))
                .map(([, chain]) => chain.map(path => relative(SRC, path)).join(' -> '));
            expect(offenders).toEqual([]);
        },
    );
});
