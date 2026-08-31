'use client'
import { useCallback, useEffect, useState } from 'react';
import { getMessaging, getToken } from 'firebase/messaging';
import firebaseApp from '../firebase/firebase';
import { getNativePushToken } from '../firebase/nativePush';
import { isNativeShell } from '../native';
import { useIsAuthorised } from './useAuthGuard';
import { useNotificationPermission } from './useNotificationPermission';

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
  const [token, setToken] = useState('');
  // Only ever the *outcome* of an attempt. Whether an attempt is even wanted
  // is derived below rather than written here: setting state from the effect
  // body is a cascading render (and the linter says so), and there is nothing
  // to store anyway — `registering` is exactly what "we are about to try" means.
  const [outcome, setOutcome] = useState<PushRegistrationState>('registering');
  // Bumping this re-runs the effect below, which is all a retry is.
  const [attempt, setAttempt] = useState(0);

  // A standing 'granted' and nothing else: 'unsupported' covers the browsers
  // with no Notification API or no service worker, so there is no separate
  // `pushSupported()` check to keep in step here.
  const wanted = isAuthorised && permission === 'granted';
  const registration: PushRegistrationState = wanted ? outcome : 'idle';

  useEffect(() => {
    if (!wanted) {
      return;
    }

    // A retry, or a permission grant, can land while the previous attempt is
    // still in flight — so the one that was superseded must not report its
    // own outcome over the newer one's.
    let cancelled = false;
    const reached = (state: PushRegistrationState) => {
      if (!cancelled) {
        setOutcome(state);
      }
    };

    const retrieveToken = async () => {
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
        const response = await fetch('/api/notificationtoken', {
          method: "POST",
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({token: currentToken})
        });

        if (!response.ok) {
          throw new Error(`Failed to register notification token (${response.status})`);
        }
      } catch (error) {
        console.error(error);
        reached('not-saved');
        return;
      }

      if (cancelled) {
        return;
      }
      // Published only once the server knows about it, so anything keying off
      // `fcmToken` (e.g. the device list) sees it registered.
      setToken(currentToken);
      reached('registered');
    };

    retrieveToken();

    return () => { cancelled = true; };
  }, [wanted, attempt]);

  // Back to 'registering' as well as re-running the effect, so the failure the
  // player just pressed the button about goes away on the press rather than
  // when the retry happens to finish.
  const retryRegistration = useCallback(() => {
    setOutcome('registering');
    setAttempt((n) => n + 1);
  }, []);

  return { fcmToken: token, notificationPermissionStatus: permission, registration, retryRegistration };
};

export default useFcmToken;
