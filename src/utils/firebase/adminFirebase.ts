// Every import here is from a submodule, never from the `firebase-admin` root.
// The root barrel re-exports the whole SDK, so pulling `credential` off it also
// traced @google-cloud/firestore, google-gax, google-auth-library and node-forge
// into the bundle — about 8MB of Firestore and gRPC machinery, in every one of
// the ~30 route handlers that can send a push, for an app that only ever calls
// FCM. `cert` is the same function reached from the entry point that stops at
// app initialisation.
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { Messaging, getMessaging } from 'firebase-admin/messaging';

export function getAdminMessaging(): Messaging {
    if (!getApps().length) {
        initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            })
        }, 'adminApp');
    }
    return getMessaging(getApp('adminApp'));
}
