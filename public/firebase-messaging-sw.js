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

// The `data.event` of the test push from Settings — the string is
// NOTIFICATION_TEST_EVENT in src/utils/firebase/pushNotification.ts, and a
// literal here because a static worker can't import it. serviceWorker.test.ts
// fails if the two drift apart.
const TEST_EVENT = 'NotificationTest';

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
 * The payload of `e`, flattened the same way the handler below flattens one,
 * if this push is the test — and undefined for every other push, including one
 * carrying no readable JSON at all (a probe, or a push from something that
 * isn't us). Anything unreadable falls through to the SDK exactly as before.
 */
function readTestPush(e) {
    try {
        const payload = e.data.json();
        const data = { ...payload.data, ...payload.notification };
        return data.event === TEST_EVENT ? data : undefined;
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

/*
 * Overrides push notification data, to avoid having 'notification' key and firebase blocking
 * the message handler from being called
 */
self.addEventListener('push', (e) => {
    // Skip if event is our own custom event
    if (e.custom) return;

    // The test push is shown here and goes no further. Below this point the
    // payload is handed to the Firebase SDK, which — when any window of the app
    // is visible — forwards it to the page and displays nothing at all. That is
    // the right answer for a turn (the screen updates instead) and the wrong
    // one for a button whose entire job is to make a notification appear, since
    // whoever pressed it is looking at the app by definition.
    const testPush = readTestPush(e);
    if (testPush) {
        e.stopImmediatePropagation();
        e.waitUntil(showPushNotification(testPush));
        return;
    }

    // Kep old event data to override
    const oldData = e.data;

    // Create a new event to dispatch, pull values from notification key and put it in data key,
    // and then remove notification key
    const newEvent = new CustomPushEvent({
        data: {
            ehheh: oldData.json(),
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
        waitUntil: e.waitUntil.bind(e),
    });

    // Stop event propagation
    e.stopImmediatePropagation();

    // Dispatch the new wrapped event
    dispatchEvent(newEvent);
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    return showPushNotification(payload.data);
});

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