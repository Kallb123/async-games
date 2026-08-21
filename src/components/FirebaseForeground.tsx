'use client'
import useFcmToken from "@/utils/hooks/useFcmToken";
import { getMessaging, onMessage } from 'firebase/messaging';
import firebaseApp from '../utils/firebase/firebase';
import { useEffect } from 'react';

export function FcmTokenComp() {
  const { fcmToken, notificationPermissionStatus } = useFcmToken();

  useEffect(() => {
    // 'granted' is only ever reported by a browser that supports push, so this
    // is the whole check — see `useNotificationPermission`.
    if (notificationPermissionStatus !== 'granted') {
      return;
    }
    const messaging = getMessaging(firebaseApp);
    const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Foreground push notification received:', payload);
        const payloadEvent = payload?.data?.event;
        if (payloadEvent) {
            const event = new CustomEvent(payloadEvent, payload?.data);
            window.dispatchEvent(event);
        }
    });
    return () => {
        console.log("Unsubscribing from firebase");
        unsubscribe(); // Unsubscribe from the onMessage event on cleanup
    };
  }, [notificationPermissionStatus]);

  return null; // This component is primarily for handling foreground notifications
}
