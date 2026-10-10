import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { reachableFrom, SRC_ROOT } from "@/utils/testing/moduleGraph";

// `/` is prerendered and served from the CDN (`○` in the build table), which
// only holds while nothing it renders reads the request or sits behind a
// Suspense boundary. `npm run build` is what shows the route going `ƒ`; these
// say why before anyone has to read the table.
describe("the static home page", () => {
    it("has no root loading.tsx", () => {
        // A loading file is a Suspense boundary round the page. React only
        // inlines a boundary under ~13kB, so round the prerendered home page it
        // sends a skeleton first and the page in a hidden block swapped in later
        // — the wrong screen for every landing-page visitor (see HomeLoading).
        expect(existsSync(path.join(SRC_ROOT, "app", "loading.tsx"))).toBe(false);
    });

    it("never reaches next/headers", () => {
        // `cookies()` / `headers()` turn a route dynamic. The cookie hint is read
        // in the browser (HomeScreen); `signedInHint.ts` is /join's.
        const offenders = [...reachableFrom(path.join(SRC_ROOT, "app", "page.tsx")).keys()]
            .filter(file => /from\s*['"]next\/headers['"]/.test(readFileSync(file, "utf8")))
            .map(file => path.relative(SRC_ROOT, file));
        expect(offenders).toEqual([]);
    });
});
