'use client'
import { useEffect, useState } from 'react';
import { getMessaging, getToken } from 'firebase/messaging';
import firebaseApp from '../firebase/firebase';
import { getNativePushToken } from '../firebase/nativePush';
import { isNativeShell } from '../native';
import { useIsAuthorised } from './useAuthGuard';
import { useNotificationPermission } from './useNotificationPermission';

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
 */
const useFcmToken = () => {
  const { isAuthorised } = useIsAuthorised();
  const permission = useNotificationPermission();
  const [token, setToken] = useState('');

  useEffect(() => {
    const retrieveToken = async () => {
      try {
        // A standing 'granted' and nothing else: 'unsupported' covers the
        // browsers with no Notification API or no service worker, so there is
        // no separate `pushSupported()` check to keep in step here.
        if (!isAuthorised || permission !== 'granted') {
          return;
        }
        // Same token, two ways of asking for it: the native shell registers
        // with FCM through the OS (`nativePush.ts`), because the WebView it
        // runs has no service worker push for the web SDK to use — and
        // `getMessaging` throws outright there rather than returning nothing.
        // What comes back is a registration token either way, so everything
        // below this line is one path.
        const currentToken = isNativeShell()
          ? await getNativePushToken()
          : await getToken(getMessaging(firebaseApp), {
              vapidKey: 'BDp9df2UuofIOAnwGQkfG7hyRf73aZ3kk6_GltpZtTFcIaMtwmcz7whJ_7GHB1Zay3QtQ8FqQMnNKoyD6LLpaZo',
            });
        if (!currentToken) {
          console.log('No registration token available. Request permission to generate one.');
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
            throw new Error('Failed to register notification token');
          }
        } catch (error) {
          console.error(error);
        }
        // Published only once the server knows about it, so anything keying off
        // `fcmToken` (e.g. the device list) sees it registered.
        setToken(currentToken);
      } catch (error) {
        console.log('An error occurred while retrieving token:', error);
      }
    };

    retrieveToken();
  }, [isAuthorised, permission]);

  return { fcmToken: token, notificationPermissionStatus: permission };
};

export default useFcmToken;
