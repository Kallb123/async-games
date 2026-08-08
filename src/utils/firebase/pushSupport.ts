/**
 * Whether this browser can receive web push at all.
 *
 * FCM needs both halves: the Notification API to ask for permission, and a
 * service worker to deliver through. Asking for one without checking the other
 * gets you a permission you can never use, so the check is kept whole and in
 * one place — the hook that registers the token, the foreground listener, and
 * the settings screen all read it from here.
 *
 * Also false during SSR, where neither exists.
 */
export function pushSupported(): boolean {
    return typeof window !== 'undefined'
        && 'Notification' in window
        && 'serviceWorker' in navigator;
}
