'use client'
import { useEffect } from 'react';

/**
 * Registers the root-scope service worker (`public/sw.js`).
 *
 * Separate from the Firebase messaging worker, which Firebase registers itself
 * at its own scope the first time a device asks for a push token. This one
 * exists to control the app shell: owning `fetch` at "/" is what makes the app
 * installable, and it means an installed app opened with no network shows our
 * offline page rather than the browser's error page.
 *
 * Registering from an effect is late enough on its own — effects run after
 * hydration and after paint — so there is no `load` gate to get wrong. A
 * failure is logged rather than thrown: a browser without service workers, or
 * a user who has blocked them, should still get a working app.
 */
export function useServiceWorker() {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) {
            return;
        }
        navigator.serviceWorker.register('/sw.js')
            .catch((error) => console.error('Service worker registration failed', error));
    }, []);
}
