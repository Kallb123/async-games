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

/**
 * Whether the shell the app is running in actually carries a given Capacitor
 * plugin.
 *
 * Not the same question as `isNativeShell()`, and the difference bites: the APK
 * loads the live site, so today's code runs inside whatever shell the player
 * last installed. A plugin added to the bundle after they installed is
 * *registered* in the JavaScript but has no native half to call, and Capacitor
 * quietly falls through to the plugin's web implementation instead of failing —
 * which, for a plugin that exists precisely because the WebView can't do the
 * job, is the one outcome guaranteed not to work.
 *
 * So ask this before calling a plugin an older shell won't have, and tell the
 * player to update rather than showing them a control that can't do anything.
 * (`shareOrCopyLink` predates this and reads the `UNIMPLEMENTED` rejection
 * instead — it can, because `@capacitor/share` registers no web fallback to be
 * swallowed by.)
 */
export function hasNativePlugin(name: string): boolean {
    return isNativeShell() && Capacitor.isPluginAvailable(name);
}
