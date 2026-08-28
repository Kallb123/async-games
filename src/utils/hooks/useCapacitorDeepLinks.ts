'use client'

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { App } from '@capacitor/app';
import { isNativeShell } from '@/utils/native';

/**
 * Native Android shell only: opens a link to the site *inside* the app.
 *
 * The manifest claims `asyncgames.com` as an App Link, so a shared join link
 * tapped in a chat app launches this activity rather than the browser. Android
 * delivers it as an intent, which Capacitor surfaces as `appUrlOpen` — and
 * because the activity is `singleTask`, an app that is already running gets the
 * event instead of a second copy of itself. Without this listener that event
 * goes unanswered and the player lands on whatever screen they left open.
 *
 * Only the path is followed, through the router: the WebView is already on the
 * site, so a full URL load would be a needless round trip, and a link to
 * another origin is not ours to follow at all.
 */
export function useCapacitorDeepLinks() {
    const router = useRouter();

    useEffect(() => {
        if (!isNativeShell()) {
            return;
        }

        const listener = App.addListener('appUrlOpen', ({ url }) => {
            try {
                const target = new URL(url);
                if (target.origin !== window.location.origin) {
                    return;
                }
                router.push(`${target.pathname}${target.search}`);
            } catch (error) {
                console.error('Ignoring an unreadable deep link', url, error);
            }
        });

        return () => {
            listener.then((handle) => handle.remove());
        };
    }, [router]);
}
