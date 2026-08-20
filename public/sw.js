// Root-scope service worker for the app shell.
//
// Two jobs, deliberately no more:
//  - own a `fetch` handler at scope "/", which is what makes the app
//    installable and lets an installed app launch on its own;
//  - keep something of ours to show when the network is gone, instead of the
//    browser's error page inside the app frame.
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
    event.respondWith(
        fetch(event.request).catch(async () =>
            // `Response.error()` rather than `undefined` for the case where the
            // precache never landed: a network error is what the browser would
            // have shown anyway, whereas `undefined` throws.
            (await caches.match(OFFLINE_URL)) ?? Response.error()
        )
    );
});
