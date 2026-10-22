'use client'

import { useSyncExternalStore } from "react";
import { WARM_UP_SCRIPT } from "@/utils/warmUp";

// Nothing changes under a mounted page, so there is nothing to subscribe to.
const subscribeToNothing = () => () => {};
// The HTML the server sent (and the hydration of it) is the one place the
// script is wanted; a render in the browser is not.
const inServerHtml = () => true;
const inBrowserRender = () => false;

/**
 * The warm-up ping's inline script (`WARM_UP_SCRIPT`, see `utils/warmUp.ts`),
 * for a page whose HTML is the same static bytes for everyone: the home page
 * and the shell every game board is served in. It asks the route the page will
 * call next to wake its function instance while Clerk is still loading, and
 * only when the visitor looks signed in.
 *
 * It renders only into HTML that came from the server, as `HomeScreen`'s
 * pre-paint script does: a navigation inside the app renders on the client,
 * where React would warn about a script it cannot run, and where Clerk has
 * long since loaded, so there is nothing to get ahead of. Hydration still
 * renders it, to match the HTML, and drops it afterwards.
 *
 * It carries nothing about the viewer or the game: the script reads the cookie
 * and the path in the browser, so the cached shell stays the same for everyone
 * (the rule in `app/games/staticShell.ts`).
 */
export default function WarmUpScript() {
    const render = useSyncExternalStore(subscribeToNothing, inBrowserRender, inServerHtml);
    return render ? <script dangerouslySetInnerHTML={{ __html: WARM_UP_SCRIPT }} /> : null;
}
