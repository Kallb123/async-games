importScripts('https://www.gstatic.com/firebasejs/10.5.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.5.0/firebase-messaging-compat.js');

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

    const { title, body, image, icon, tag, ...restPayload } = payload.data;
    // Always show something. Every push the server sends carries a title and a
    // body — `sendPushToUsers` requires a notification precisely so this can
    // never bail without showing one — but a push we somehow can't render is
    // still worth a generic row, because a push that displays nothing counts
    // against the app (see usePushEvents).
    const notificationOptions = {
        body: body || 'Something happened in one of your games.',
        icon: image || '/icons/icon-192.png', // the app's own mark, for pushes that carry no game art
        data: restPayload,
        // Replace rather than stack: a week away used to mean a column of "Your
        // move in Train Time" for the same game. The server sets this per kind
        // and per game (see `tagFor`), so a nudge still arrives beside a turn;
        // the fallback is only for a payload that somehow arrives without one.
        tag: tag || 'async-games',
        // ...but still alert for the replacement, otherwise the newer one lands
        // silently and the player never learns their turn came round again.
        renotify: true,
    };
    return self.registration.showNotification(title || 'Async Games', notificationOptions);
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