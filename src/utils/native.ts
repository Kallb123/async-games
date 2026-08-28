import { Capacitor } from '@capacitor/core';

/**
 * True inside the native Android shell (`capacitor.config.ts`), false in any
 * browser — including an installed PWA, which is still a browser.
 *
 * The shell runs the same React the web does, loaded from the live site, so
 * "which of the two am I?" gets asked from several places: the hooks that
 * register Capacitor's own listeners, push (its WebView has no Notification or
 * Push API), sharing (no Web Share API), and the settings footer. One import
 * for all of them, rather than each file reaching for `Capacitor` itself.
 *
 * Safe during SSR, where it answers false — which is also the honest answer,
 * since the server is rendering for a client it hasn't met yet. Anything that
 * would render differently either way has to wait for hydration.
 */
export function isNativeShell(): boolean {
    return Capacitor.isNativePlatform();
}
