import type { ReactNode } from "react";

/**
 * The server half of a game route, shared by every `games/<game>/[id]` folder:
 * each one's `layout.tsx` is the single line
 * `export { default, generateStaticParams } from "../../staticShell";`.
 *
 * Those pages are `'use client'` and fetch everything through the authorised
 * API, so what the server renders for them is the same shell for every id and
 * every viewer. Left alone Next treats a dynamic segment as `ƒ (Dynamic)` and
 * runs a function for each navigation and cold load. `generateStaticParams`
 * returning `[]` (with `dynamicParams` left at its default of `true`) builds no
 * ids ahead of time, renders an id the first time it is asked for, and caches
 * the result, so after that a navigation commits at static-route speed, `<Link>`
 * prefetch can fetch the whole shell, and a cold load can come from the CDN.
 *
 * It lives in a layout because a `'use client'` page can't export it. The
 * re-export is honoured, so there is one definition, not one per game.
 *
 * THE RULE THAT KEEPS THIS SAFE: never read viewer data on the server in these
 * routes — not in the page, this layout, `generateMetadata`, or anything they
 * render on the server (`auth()`, `currentUser()`, `cookies()`, `headers()`,
 * `searchParams`, the database). The shell is cached and served to everyone, so
 * anything personal in it would be served to everyone. Personal data arrives
 * only through the API, after the client has signed in. Reading any of those
 * also quietly turns the route dynamic again, which the build output
 * (`ƒ` against `●`) will show.
 */
export default function StaticShellLayout({ children }: { children: ReactNode }) {
    return children;
}

export function generateStaticParams(): [] {
    return [];
}
