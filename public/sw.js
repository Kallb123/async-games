// Root-scope service worker for the app shell.
//
// Two jobs, deliberately no more:
//  - own a `fetch` handler at scope "/", which is what makes the app
//    installable and lets an installed app launch on its own;
//  - keep something of ours to show when the network is gone, instead of the
//    browser's error page inside the app frame.
//
// Having a handler in the way of every navigation has a cost of its own: the
// browser can't send the request until the worker has booted, which on a cold
// phone is hundreds of ms. Navigation preload gives that time back — see the
// `activate` and `fetch` handlers. Enabling it outlives this file: if a worker
// without the preload ever replaces this one (a rollback), it must call
// `self.registration.navigationPreload.disable()` in its own `activate`, or
// every navigation will fetch the page twice — once for a preload nobody reads.
//
// Push is NOT handled here. That stays in `firebase-messaging-sw.js`, which
// Firebase registers at its own scope the first time a device asks for a
// token. Two workers, one job each — merging them would mean this file could
// no longer be changed without risking notifications.

const CACHE = 'ag-shell-v1';
const OFFLINE_URL = '/offline.html';
// The mark, so the offline page looks like the app rather than a browser page.
const PRECACHE = [OFFLINE_URL, '/icons/icon.svg'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
            ))
            // Lets the browser send a navigation's request while this worker is
            // still starting up, rather than after. Not every browser has it, and
            // one may refuse; either way the worker activates as before, since
            // preload is only an optimisation.
            .then(() => self.registration.navigationPreload?.enable().catch(() => {}))
            .then(() => self.clients.claim())
    );
});

// Navigations only, and always network-first.
//
// Everything else — API responses, Next's own assets, Clerk — goes straight to
// the network untouched. Caching game state or an auth response would show a
// player stale or someone else's data, which is far worse than having no
// offline mode at all.
self.addEventListener('fetch', (event) => {
    if (event.request.mode !== 'navigate') {
        return;
    }
    // The preload response is always consumed when there is one: a preload the
    // handler never reads is a second request for the same page, thrown away.
    // It is the same network request `fetch(event.request)` would have made,
    // only started earlier, so a failed one is the same "network is gone" and
    // falls through to the offline page below.
    event.respondWith(
        (async () => (await event.preloadResponse) ?? fetch(event.request))().catch(async () =>
            // `Response.error()` rather than `undefined` for the case where the
            // precache never landed: a network error is what the browser would
            // have shown anyway, whereas `undefined` throws.
            (await caches.match(OFFLINE_URL)) ?? Response.error()
        )
    );
});
