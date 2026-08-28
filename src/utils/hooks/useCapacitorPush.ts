'use client'

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PushNotifications } from '@capacitor/push-notifications';
import { isNativeShell } from '@/utils/native';
import { dispatchPushEvent } from '@/utils/firebase/pushEvents';

/**
 * Native Android shell only: the two things that happen to a push once it has
 * arrived. No-ops in a browser, where the web SDK and the service worker
 * (`FcmTokenComp`, `public/firebase-messaging-sw.js`) do the same two jobs.
 *
 * - **Received while the app is open** — Android hands it straight to us
 *   instead of the tray, so it is re-dispatched as its `event` for whatever
 *   screen is listening, exactly as `onMessage` does on the web. A push that
 *   arrives while the app is backgrounded is shown by the OS and never reaches
 *   this listener; the screen catches up on its next foreground.
 * - **Tapped** — the push carries the absolute `link` the web notification
 *   click uses. Following it as a path keeps the tap inside the app: handing
 *   the whole URL to the WebView would be a fresh page load of the remote site,
 *   and a link to another origin has no business steering this app at all.
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

        const handles = [
            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                dispatchPushEvent(notification.data);
            }),
            PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
                dispatchPushEvent(notification.data);
                const link = notification.data?.link;
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
            }),
        ].map((handle) => handle.catch((error) => {
            // A shell built before this plugin existed rejects both of these —
            // and it will, because the app loads the live site, so an APK
            // installed months ago runs today's code. Its pushes still arrive
            // in the tray; only the in-app half is missing, which is a reason
            // to log rather than to leave two rejected promises lying around.
            console.error('Native push listeners unavailable in this app build', error);
            return null;
        }));

        return () => {
            handles.forEach((handle) => handle.then((listener) => listener?.remove()));
        };
    }, [router]);
}
