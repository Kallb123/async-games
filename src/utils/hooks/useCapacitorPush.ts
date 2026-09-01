'use client'

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNativeShell } from '@/utils/native';
import { dispatchPushEvent } from '@/utils/firebase/pushEvents';
import { ensureNotificationChannel, showForegroundNotification } from '@/utils/firebase/nativePush';

/**
 * Native Android shell only: the three things that happen to a push once it
 * has arrived. No-ops in a browser, where the web SDK and the service worker
 * (`FcmTokenComp`, `public/firebase-messaging-sw.js`) do the same jobs.
 *
 * - **Received while the app is open** — Android hands it straight to us
 *   instead of the tray, so it is re-dispatched as its `event` for whatever
 *   screen is listening, exactly as `onMessage` does on the web, and then
 *   drawn ourselves via `showForegroundNotification` — the tray never sees it
 *   otherwise. A push that arrives while the app is backgrounded is shown by
 *   the OS and never reaches this listener; the screen catches up on its next
 *   foreground.
 * - **Tapped from the tray** — the push carries the absolute `link` the web
 *   notification click uses.
 * - **Tapped from our own foreground notification** — same `link`, carried in
 *   `extra` rather than `data` because it went through `LocalNotifications`,
 *   not FCM, to get shown.
 *
 * Both taps follow the link the same way (`followLink`, below) — into the app
 * rather than a fresh WebView load, and never to another origin.
 *
 * Mounted once, app-wide, in `Providers`: these are per-app listeners, not
 * per-screen ones, and registering them per screen would dispatch one push as
 * several events.
 */
export function useCapacitorPush() {
    const router = useRouter();

    useEffect(() => {
        if (!isNativeShell()) {
            return;
        }

        ensureNotificationChannel();

        const handles = [
            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                dispatchPushEvent(notification.data);
                showForegroundNotification(notification);
            }),
            PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
                dispatchPushEvent(notification.data);
                followLink(notification.data?.link, router);
            }),
            LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
                followLink(notification.extra?.link, router);
            }),
        ].map((handle) => handle.catch((error) => {
            // A shell built before a given plugin existed rejects that
            // listener — and it will, because the app loads the live site, so
            // an APK installed months ago runs today's code. Its pushes still
            // arrive in the tray; only the in-app half is missing, which is a
            // reason to log rather than to leave a rejected promise lying
            // around, for any of the three above.
            console.error('Native push listeners unavailable in this app build', error);
            return null;
        }));

        return () => {
            handles.forEach((handle) => handle.then((listener) => listener?.remove()));
        };
    }, [router]);
}

function followLink(link: unknown, router: ReturnType<typeof useRouter>) {
    if (typeof link !== 'string') {
        return;
    }
    try {
        const target = new URL(link, window.location.origin);
        if (target.origin !== window.location.origin) {
            return;
        }
        router.push(`${target.pathname}${target.search}`);
    } catch (error) {
        console.error('Ignoring an unreadable notification link', link, error);
    }
}
