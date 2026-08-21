/**
 * Whether this browser can receive web push at all.
 *
 * FCM needs both halves: the Notification API to ask for permission, and a
 * service worker to deliver through. Asking for one without checking the other
 * gets you a permission you can never use, so the check is kept whole and in
 * one place. `useNotificationPermission` is the one caller: it folds this into
 * its 'unsupported' state, and everything else reads the permission from
 * there rather than repeating the pair of checks.
 *
 * Also false during SSR, where neither exists.
 */
export function pushSupported(): boolean {
    return typeof window !== 'undefined'
        && 'Notification' in window
        && 'serviceWorker' in navigator;
}
