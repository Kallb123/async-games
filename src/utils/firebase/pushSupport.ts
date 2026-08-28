import { isNativeShell } from '@/utils/native';

/**
 * Whether this client can receive push at all.
 *
 * In a browser, FCM needs both halves: the Notification API to ask for
 * permission, and a service worker to deliver through. Asking for one without
 * checking the other gets you a permission you can never use, so the check is
 * kept whole and in one place. `useNotificationPermission` is the one caller:
 * it folds this into its 'unsupported' state, and everything else reads the
 * permission from there rather than repeating the pair of checks.
 *
 * The native Android shell has neither half — Android's WebView implements no
 * Notification API and no Push API — and receives push all the same, through
 * the OS rather than the WebView (see `nativePush.ts`). So it answers true
 * before those checks are reached, rather than being told by its own browser
 * engine that the app it is running cannot do the thing it does.
 *
 * Also false during SSR, where none of it exists.
 */
export function pushSupported(): boolean {
    return isNativeShell()
        || (typeof window !== 'undefined'
            && 'Notification' in window
            && 'serviceWorker' in navigator);
}
