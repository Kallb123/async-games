import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

import { apiRouteFiles } from '@/utils/testing/apiRoutes';
import { reachableFrom, SRC_ROOT } from '@/utils/testing/moduleGraph';

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

const isClientModule = (path: string) =>
    /^\s*['"]use client['"]/.test(readFileSync(path, 'utf8'));

describe('API route handlers', () => {
    const routes = apiRouteFiles();

    it('finds the route handlers to check', () => {
        expect(routes.length).toBeGreaterThan(10);
    });

    it.each(routes.map(route => [relative(SRC_ROOT, route), route]))(
        'never reaches a client module: %s',
        (_name, route) => {
            const offenders = [...reachableFrom(route)]
                .filter(([path]) => isClientModule(path))
                .map(([, chain]) => chain.map(path => relative(SRC_ROOT, path)).join(' -> '));
            expect(offenders).toEqual([]);
        },
    );
});
