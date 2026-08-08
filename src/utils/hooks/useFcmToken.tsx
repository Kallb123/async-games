'use client'
import { useEffect, useState } from 'react';
import { getMessaging, getToken } from 'firebase/messaging';
import firebaseApp from '../firebase/firebase';
import { pushSupported } from '../firebase/pushSupport';
import { useIsAuthorised } from './useAuthGuard';

/**
 * Registers this device for push, once the viewer is signed in and unlocked
 * (see `useIsAuthorised`).
 *
 * The auth gate is what keeps the browser's notification prompt off the public
 * landing page: `FcmTokenComp` is mounted by the screens behind the login, but
 * those screens render for a moment before Clerk has loaded — long enough to
 * ask a visitor with no account for a permission they have nothing to use yet.
 * Waiting for `isAuthorised` also means the token is only ever POSTed for a
 * session the API will accept.
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

        // Retrieve the notification permission status
        const permission = await Notification.requestPermission();
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