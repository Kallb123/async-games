'use client'
import useFcmToken from "@/utils/hooks/useFcmToken";
import { getMessaging, onMessage } from 'firebase/messaging';
import firebaseApp from '../utils/firebase/firebase';
import { isNativeShell } from '../utils/native';
import { dispatchPushEvent } from '../utils/firebase/pushEvents';
import { useEffect } from 'react';

export function FcmTokenComp() {
  const { fcmToken, notificationPermissionStatus } = useFcmToken();

  useEffect(() => {
    // 'granted' is only ever reported by a client that supports push, so this
    // is the whole check — see `useNotificationPermission`.
    if (notificationPermissionStatus !== 'granted') {
      return;
    }
    // The native shell has its own delivery (`useCapacitorPush`), and asking
    // the web SDK for messaging inside a WebView that has no service-worker
    // push throws rather than declining politely.
    if (isNativeShell()) {
      return;
    }
    const messaging = getMessaging(firebaseApp);
    const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Foreground push notification received:', payload);
        dispatchPushEvent(payload?.data);
    });
    return () => {
        console.log("Unsubscribing from firebase");
        unsubscribe(); // Unsubscribe from the onMessage event on cleanup
    };
  }, [notificationPermissionStatus]);

  return null; // This component is primarily for handling foreground notifications
}
