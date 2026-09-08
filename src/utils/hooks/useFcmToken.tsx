'use client'
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getMessaging, getToken } from 'firebase/messaging';
import firebaseApp from '../firebase/firebase';
import { getNativePushToken } from '../firebase/nativePush';
import { isNativeShell } from '../native';
import { useIsAuthorised } from './useAuthGuard';
import { useNotificationPermission } from './useNotificationPermission';
import { REQUEST_TIMEOUT_MS } from './fetchWithSessionRetry';

/**
 * How far this device has got towards actually being able to receive a push.
 *
 * Granting permission is only the first of three things that have to happen —
 * the device also has to be issued a token, and the server has to be told
 * about it — and until this existed the last two failed silently. A player
 * whose token never landed saw a Settings screen reporting notifications as on
 * (it read the browser permission and nothing else), waited for a push that
 * could never come, and never opened the app again to trigger the retry that
 * would have fixed it. `NotificationStatus` is what says which of the three it
 * got to.
 */
export type PushRegistrationState =
    /** Nothing to report: not signed in, or permission not granted. */
    | 'idle'
    /** Asking for a token, or handing one to the server. */
    | 'registering'
    /** Done — the server can push to this device. */
    | 'registered'
    /** The browser or the OS would not issue a push token. */
    | 'no-token'
    /** We have a token; the server didn't take it. */
    | 'not-saved';

// One registration per page load, however many components ask for it. It used
// to be one per mount, and several screens mount two (their own
// `FcmTokenComp` plus something reading the outcome), so the same token was
// fetched twice and POSTed twice on every load — two concurrent
// read-modify-writes of one Clerk metadata object for no gain. The state is a
// module-level store for the same reason `useNotificationPermission` is: this
// is a fact about the device, not about a component, so every consumer should
// be looking at the same copy of it.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
        listeners.delete(onChange);
    };
}

function notify() {
    listeners.forEach((listener) => listener());
}

let outcome: PushRegistrationState = 'registering';
let registeredToken = '';
// The attempt in flight, so a second caller joins it rather than starting
// another, and a retry can tell "already trying" from "failed, try again".
let attempt: Promise<void> | null = null;

// Snapshots are primitives, which is what lets two `useSyncExternalStore`
// calls share one listener set without either of them re-rendering forever.
const getOutcomeSnapshot = (): PushRegistrationState => outcome;
const getTokenSnapshot = (): string => registeredToken;
// The server has no device to register. Matching the module's own initial
// values keeps the first client render identical to the server's.
const getOutcomeServerSnapshot = (): PushRegistrationState => 'registering';
const getTokenServerSnapshot = (): string => '';

function reached(state: PushRegistrationState) {
    outcome = state;
    notify();
}

async function registerThisDevice(): Promise<void> {
    let currentToken: string | undefined;
    try {
        // Same token, two ways of asking for it: the native shell registers
        // with FCM through the OS (`nativePush.ts`), because the WebView it
        // runs has no service worker push for the web SDK to use — and
        // `getMessaging` throws outright there rather than returning nothing.
        // What comes back is a registration token either way, so everything
        // below this line is one path.
        currentToken = isNativeShell()
            ? await getNativePushToken()
            : await getToken(getMessaging(firebaseApp), {
                  vapidKey: 'BDp9df2UuofIOAnwGQkfG7hyRf73aZ3kk6_GltpZtTFcIaMtwmcz7whJ_7GHB1Zay3QtQ8FqQMnNKoyD6LLpaZo',
              });
    } catch (error) {
        // No Play Services, a blocked push service, a service worker that
        // never activated: all of them land here, and all of them mean this
        // device cannot be pushed to however granted the permission looks.
        console.log('An error occurred while retrieving token:', error);
        reached('no-token');
        return;
    }

    if (!currentToken) {
        console.log('No registration token available. Request permission to generate one.');
        reached('no-token');
        return;
    }

    try {
        // Timed out rather than left open: a request that stalls (a phone
        // moving between cell and wifi) would otherwise leave this device
        // reporting 'registering' forever, which is now something the player
        // is looking at.
        const response = await fetch('/api/notificationtoken', {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({token: currentToken}),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        if (!response.ok) {
            throw new Error(`Failed to register notification token (${response.status})`);
        }
    } catch (error) {
        console.error(error);
        reached('not-saved');
        return;
    }

    // Published only once the server knows about it, so anything keying off
    // `fcmToken` (e.g. the device list) sees it registered.
    registeredToken = currentToken;
    reached('registered');
}

/**
 * Registers this device, unless an attempt is already running or one has
 * already succeeded. `force` is the retry: it re-runs a *finished* attempt,
 * successful or not, and is still a no-op while one is in flight — the screen
 * that offers the retry is already showing "Registering…" in that case.
 */
function ensureRegistered(force = false) {
    if (attempt || (!force && outcome === 'registered')) {
        return;
    }
    // Back to 'registering' before the work starts, so the failure the player
    // just pressed the button about goes away on the press rather than when
    // the retry happens to finish.
    reached('registering');
    attempt = registerThisDevice().finally(() => { attempt = null; });
}

/**
 * Registers this device for push, once the viewer is signed in and unlocked
 * (see `useIsAuthorised`) *and* has already granted notification permission.
 *
 * This hook never asks for permission. `FcmTokenComp` is mounted by nearly
 * every screen behind the login, so requesting here fires the browser's
 * permission prompt at people who have done nothing to ask for it — the
 * drive-by prompt that browsers penalise origins for. Asking is left to the
 * buttons on `NotificationOffer`, where the click is the consent.
 *
 * The auth gate stays for the other half of the job: the token is only ever
 * POSTed for a session the API will accept.
 *
 * Reading permission from the shared store rather than once per mount is what
 * lets a grant register the device without a page reload: pressing Enable
 * nudges the store, this effect re-runs, and the token is POSTed.
 *
 * `retryRegistration` re-runs the whole attempt. A full page load did that
 * already, which is no use to the one player who needs it — they are waiting
 * for a notification, so they are not opening the app.
 */
const useFcmToken = () => {
  const { isAuthorised } = useIsAuthorised();
  const permission = useNotificationPermission();
  const registered = useSyncExternalStore(subscribe, getOutcomeSnapshot, getOutcomeServerSnapshot);
  const token = useSyncExternalStore(subscribe, getTokenSnapshot, getTokenServerSnapshot);

  // A standing 'granted' and nothing else: 'unsupported' covers the browsers
  // with no Notification API or no service worker, so there is no separate
  // `pushSupported()` check to keep in step here.
  const wanted = isAuthorised && permission === 'granted';
  // The shared outcome is about the device; whether *this* viewer has anything
  // to report about it is per-caller, which is why 'idle' is derived here
  // rather than written into the store.
  const registration: PushRegistrationState = wanted ? registered : 'idle';

  useEffect(() => {
    if (wanted) {
      ensureRegistered();
    }
  }, [wanted]);

  const retryRegistration = useCallback(() => ensureRegistered(true), []);

  return { fcmToken: token, notificationPermissionStatus: permission, registration, retryRegistration };
};

export default useFcmToken;
