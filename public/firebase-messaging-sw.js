// Kept in step with the `firebase` version in package.json by
// src/utils/firebase/serviceWorker.test.ts. A worker running an SDK several
// majors behind the page's is a wire format nobody tested together — and the
// compat bundles are the ones to use here, because a classic service worker
// (no `type: 'module'`) cannot import the modular build.
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.1/firebase-messaging-compat.js');

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDjVL2jHMNBdxtjLaDB5gntkSuZQs-wfOM",
    authDomain: "async-games.firebaseapp.com",
    projectId: "async-games",
    storageBucket: "async-games.appspot.com",
    messagingSenderId: "881657298890",
    appId: "1:881657298890:web:ac8f8340df9d3a51565933",
    measurementId: "G-3KW1568JC5"
};

firebase.initializeApp(firebaseConfig);

/**
 * Shows the notification a payload asks for.
 *
 * Every push the server sends carries a title and a body — `sendPushToUsers`
 * requires a notification precisely so this can never bail without showing
 * one — but a push we somehow can't render is still worth a generic row,
 * because a push that displays nothing counts against the app (see
 * usePushEvents).
 */
function showPushNotification(data) {
    const { title, body, image, icon, tag, ...rest } = data;
    return self.registration.showNotification(title || 'Async Games', {
        body: body || 'Something happened in one of your games.',
        icon: image || '/icons/icon-192.png', // the app's own mark, for pushes that carry no game art
        data: rest,
        // Replace rather than stack: a week away used to mean a column of "Your
        // move in Train Time" for the same game. The server sets this per kind
        // and per game (see `tagFor`), so a nudge still arrives beside a turn;
        // the fallback is only for a payload that somehow arrives without one.
        tag: tag || 'async-games',
        // ...but still alert for the replacement, otherwise the newer one lands
        // silently and the player never learns their turn came round again.
        renotify: true,
    });
}

/**
 * The push's payload with the `notification` fields folded in beside the `data`
 * ones — the flat shape `showPushNotification` reads. Undefined for a push
 * carrying no readable JSON at all (a probe, or a push from something that
 * isn't us), which is left to the SDK to make what it can of.
 */
function readPushData(event) {
    try {
        const payload = event.data.json();
        return { ...payload.data, ...payload.notification };
    } catch {
        return undefined;
    }
}

class CustomPushEvent extends Event {
    constructor(data) {
        super('push');

        Object.assign(this, data);
        this.custom = true;
    }
}

/**
 * Every push shows a notification, whether or not the app is on screen — and
 * then carries on to the Firebase SDK, so a page that is open still hears about
 * it and refreshes (`onMessage` → `dispatchPushEvent` → `usePushEvents`).
 *
 * Displaying here is not a preference, it is the only place it can happen: the
 * SDK's own push handler returns early the moment any window of the app is
 * visible (`hasVisibleClients` in @firebase/messaging), forwarding the payload
 * to the page and showing nothing at all. So a player with the app open used to
 * get no notification — not the game they were looking at, not the other three —
 * and on iOS a push that displays nothing is a "silent push", three of which
 * cost the app its push subscription outright.
 *
 * The `notification` key is still folded into `data` before the SDK sees the
 * payload, and now for one reason only: it is what stops the SDK showing a
 * *second* notification of its own in the no-visible-window case. Display
 * belongs to this file alone — which is also why there is no
 * `onBackgroundMessage` handler here any more, and why serviceWorker.test.ts
 * holds this file to exactly one `showNotification` call.
 *
 * (The native Android shell is a separate road with the same gap: a push
 * arriving while the APK is in the foreground is handed to `useCapacitorPush`
 * and never reaches the tray. Closing that needs a local-notification plugin
 * and a notification channel, neither of which exists yet.)
 */
self.addEventListener('push', (event) => {
    // Our own re-dispatch, below — it has already been shown.
    if (event.custom) return;

    const data = readPushData(event);
    if (data) {
        event.waitUntil(showPushNotification(data));
    }

    // Keep the old event's data to override.
    const oldData = event.data;

    // A new event to dispatch, with the values under `notification` moved into
    // `data` and the `notification` key removed.
    const newEvent = new CustomPushEvent({
        data: {
            json() {
                const newData = oldData.json();
                newData.data = {
                    ...newData.data,
                    ...newData.notification,
                };
                delete newData.notification;
                return newData;
            },
        },
        waitUntil: event.waitUntil.bind(event),
    });

    // Stop event propagation.
    event.stopImmediatePropagation();

    // Dispatch the new wrapped event.
    dispatchEvent(newEvent);
});

// Registered for its side effect, not for anything we call on it: this is what
// puts the SDK's own push handler in place, and that handler is what posts an
// arriving push to the open page so `onMessage` fires there. Without it the app
// would still show notifications and would stop refreshing itself.
firebase.messaging();

self.addEventListener('notificationclick', (event) => {
    // close notification after click
    event.notification.close();

    const link = event.notification?.data?.link;
    if (!link) {
        return;
    }

    // Inside waitUntil, or the worker can be killed before the window opens and
    // the tap does nothing at all.
    //
    // Reuse a window already on the app rather than opening a second one: an
    // openWindow every time means a fresh copy of an installed PWA on every
    // notification tapped. `navigate` is the part that can fail — this worker
    // is registered at Firebase's own scope, so the app's windows are not
    // controlled by it and some browsers refuse the call — hence the fallback
    // to opening the link outright rather than leaving the player on whatever
    // screen the focused window happened to be showing.
    event.waitUntil((async () => {
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = clientList.find((client) => new URL(client.url).origin === new URL(link).origin);
        if (existing) {
            try {
                await existing.focus();
                await existing.navigate(link);
                return;
            } catch (error) {
                console.log('[firebase-messaging-sw.js] Could not steer the open window, opening a new one', error);
            }
        }
        await self.clients.openWindow(link);
    })());
});