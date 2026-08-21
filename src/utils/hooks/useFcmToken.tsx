'use client'
import { useEffect, useState } from 'react';
import { getMessaging, getToken } from 'firebase/messaging';
import firebaseApp from '../firebase/firebase';
import { pushSupported } from '../firebase/pushSupport';
import { useIsAuthorised } from './useAuthGuard';

/**
 * Registers this device for push, once the viewer is signed in and unlocked
 * (see `useIsAuthorised`) *and* has already granted notification permission.
 *
 * This hook never asks for permission. `FcmTokenComp` is mounted by nearly
 * every screen behind the login, so requesting here fires the browser's
 * permission prompt at people who have done nothing to ask for it — the
 * drive-by prompt that browsers penalise origins for. The only place that
 * calls `requestPermission()` is the "Enable" button on the settings screen,
 * where the click is the consent; this hook then picks the granted permission
 * up and registers the token.
 *
 * The auth gate stays for the other half of the job: the token is only ever
 * POSTed for a session the API will accept.
 */
const useFcmToken = () => {
  const { isAuthorised } = useIsAuthorised();
  const [token, setToken] = useState('');
  const [notificationPermissionStatus, setNotificationPermissionStatus] = useState('');

  useEffect(() => {
    const retrieveToken = async () => {
      try {
        if (!isAuthorised || !pushSupported()) {
          return;
        }
        const messaging = getMessaging(firebaseApp);

        // Read the standing permission — never request it. See above.
        const permission = Notification.permission;
        setNotificationPermissionStatus(permission);

        // Check if permission is granted before retrieving the token
        if (permission === 'granted') {
          const currentToken = await getToken(messaging, {
            vapidKey: 'BDp9df2UuofIOAnwGQkfG7hyRf73aZ3kk6_GltpZtTFcIaMtwmcz7whJ_7GHB1Zay3QtQ8FqQMnNKoyD6LLpaZo',
          });
          if (currentToken) {
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
            // Published only once the server knows about it, so anything
            // keying off `fcmToken` (e.g. the device list) sees it registered.
            setToken(currentToken);
          } else {
            console.log('No registration token available. Request permission to generate one.');
          }
        }
      } catch (error) {
        console.log('An error occurred while retrieving token:', error);
      }
    };

    retrieveToken();
  }, [isAuthorised]);

  return { fcmToken: token, notificationPermissionStatus };
};

export default useFcmToken;
