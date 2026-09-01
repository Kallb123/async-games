'use client'

import { PushNotifications, type PermissionStatus, type PushNotificationSchema } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ANDROID_NOTIFICATION_CHANNEL_ID } from './notificationChannel';
import { hashString } from '@/utils/ui/hash';

/**
 * Push, as the native Android shell does it.
 *
 * The web half of this app gets its FCM token from `firebase/messaging`, which
 * needs the Notification API and a service worker to deliver through. Android's
 * System WebView has neither — it implements no Push API and no Notification
 * API at all — so inside the Capacitor shell every one of those checks fails
 * and the app quietly decided the device could not receive push. For an app
 * whose whole job is telling you it's your turn, that made the APK the one
 * client that never could.
 *
 * The native shell registers with FCM directly instead, over the bridge, and
 * hands back a registration token of exactly the same kind the web SDK
 * produces — so `/api/notificationtoken`, the stored `TimedToken`, the device
 * list and `sendPushToUsers` all carry on unchanged. Everything native-only
 * lives here; the hooks that use it branch on `isNativeShell`
 * (`src/utils/native.ts`) and are otherwise the same code for both.
 *
 * Display is native-only too, for one case: a push arriving while the APK is
 * in the foreground is handed straight to `useCapacitorPush` instead of the
 * tray, so showing it is this app's job rather than the OS's — the
 * `@capacitor/local-notifications` half of this file
 * (`ensureNotificationChannel`, `showForegroundNotification`). A backgrounded
 * or killed app still gets the notification drawn by Android itself, same as
 * ever.
 */

/** The three answers the app's own permission model has room for. */
type NativePermission = 'default' | 'granted' | 'denied';

// 'prompt' and 'prompt-with-rationale' both mean "not asked yet, and asking is
// allowed" — the browser calls that 'default', and the rest of the app speaks
// the browser's dialect.
function toPermission(status: PermissionStatus): NativePermission {
    if (status.receive === 'granted') return 'granted';
    if (status.receive === 'denied') return 'denied';
    return 'default';
}

/** Reads the OS notification permission without prompting for it. */
export async function checkNativePermission(): Promise<NativePermission> {
    return toPermission(await PushNotifications.checkPermissions());
}

/**
 * Asks Android for permission to post notifications (a no-op returning
 * 'granted' below Android 13, which has no such permission to ask for). Call
 * it from a real user gesture, same as the web prompt.
 */
export async function requestNativePermission(): Promise<NativePermission> {
    return toPermission(await PushNotifications.requestPermissions());
}

/**
 * How long to wait for FCM to answer `register()`. It normally comes back in
 * well under a second; a device with no Play Services, no network or a broken
 * `google-services.json` may never answer at all, and a promise that never
 * settles would leave the settings screen registering forever.
 */
const TOKEN_TIMEOUT_MS = 15000;

/**
 * Registers this device with FCM and resolves its token.
 *
 * `register()` reports through events rather than its own promise, so the
 * listeners go on first and come off in the `finally` — a caller that times out
 * or fails must not leave a resolver behind to fire on the next registration.
 */
export async function getNativePushToken(): Promise<string> {
    const handles = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        let settle: (token: string) => void = () => {};
        let fail: (error: Error) => void = () => {};
        const token = new Promise<string>((resolve, reject) => {
            settle = resolve;
            fail = reject;
            timer = setTimeout(() => reject(new Error('Timed out waiting for a push token')), TOKEN_TIMEOUT_MS);
        });

        handles.push(await PushNotifications.addListener('registration', ({ value }) => settle(value)));
        handles.push(await PushNotifications.addListener('registrationError', ({ error }) => fail(new Error(error))));

        await PushNotifications.register();
        return await token;
    } finally {
        clearTimeout(timer);
        // Removal is best-effort: a listener we failed to detach is a leaked
        // callback, not a broken app, and there is nothing useful to do about
        // it from here.
        await Promise.all(handles.map((handle) => handle.remove())).catch((error) => {
            console.error('Failed to remove push registration listeners', error);
        });
    }
}

/**
 * Creates the Android channel every push is shown on (`notificationChannel.ts`).
 * A channel has to exist before either display path can use it: `schedule()`
 * below silently does nothing for an unknown channel, and so does a
 * backgrounded/killed app's own tray display of a push naming it. Idempotent —
 * `createChannel` just re-registers the same channel when called again, so
 * `useCapacitorPush` can call this on every mount rather than tracking whether
 * it already ran.
 */
export async function ensureNotificationChannel(): Promise<void> {
    try {
        await LocalNotifications.createChannel({
            id: ANDROID_NOTIFICATION_CHANNEL_ID,
            name: 'Game updates',
            description: 'Turns, invites and results in your games',
            importance: 4, // heads-up, matching the webpush `Urgency: high` header
        });
    } catch (error) {
        console.error('Failed to create the Android notification channel', error);
    }
}

/**
 * Draws the notification for a push Android handed straight to the app instead
 * of the tray — which is every push while the APK is in the foreground (see
 * `useCapacitorPush`). Mirrors `firebase-messaging-sw.js`'s `showPushNotification`:
 * same fallback title/body, same replace-not-stack behaviour, and `extra`
 * carries the push's `data` on so a tap can still follow its `link`
 * (`localNotificationActionPerformed` in `useCapacitorPush`).
 */
export async function showForegroundNotification(notification: PushNotificationSchema): Promise<void> {
    const tag = typeof notification.data?.tag === 'string' ? notification.data.tag : notification.id;
    try {
        await LocalNotifications.schedule({
            notifications: [{
                // The same `tag` the server gives each push (`pushNotification.ts`'s
                // `tagFor`) folded into a stable id, so a second "your move" in one
                // game replaces the first tray row exactly like `renotify`/`tag` do
                // for the web push shown by the service worker, instead of stacking.
                id: hashString(tag),
                title: notification.title || 'Async Games',
                body: notification.body || 'Something happened in one of your games.',
                channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
                extra: notification.data,
            }],
        });
    } catch (error) {
        console.error('Failed to show a foreground notification', error);
    }
}
