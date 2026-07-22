import { User } from '@clerk/nextjs/server';
import { Message } from 'firebase-admin/messaging';
import TimedToken from './TimedToken';
import { getAdminMessaging } from './adminFirebase';
import { getNotificationPreferences, isChannelEnabled, NotificationChannel } from './notificationPreferences';

export interface PushNotification {
    title: string;
    body?: string;
    imageUrl?: string;
}

export interface SendPushOptions {
    /** Optional notification channel this push belongs to. If provided, the push
     *  will be skipped for any user whose preferences disable it (or who has
     *  disabled notifications entirely). */
    channel?: NotificationChannel;
}

// Sends a push to every registered device of the given users. Omit `notification`
// for a silent data-only message (e.g. to refresh client state).
export async function sendPushToUsers(
    users: User[],
    data: Record<string, string>,
    notification?: PushNotification,
    options: SendPushOptions = {}
) {
    const tokens = users
        .filter((user) => {
            if (!options.channel) {
                return true;
            }
            const prefs = getNotificationPreferences(user);
            return isChannelEnabled(prefs, options.channel);
        })
        .flatMap((user) => (user.privateMetadata.notificationTokens as TimedToken[] | undefined) ?? [])
        .filter(token => token);
    if (!tokens.length) {
        return;
    }
    console.log(`Sending ${data.event ?? notification?.title ?? 'push'} to ${tokens.length} device token(s)`);
    const messaging = getAdminMessaging();
    await messaging.sendEach(tokens.map((token) => {
        const message: Message = {
            token: token.token,
            data
        };
        if (notification) {
            message.notification = {
                title: notification.title,
                body: notification.body,
                imageUrl: notification.imageUrl
            };
            if (notification.imageUrl) {
                message.apns = { fcmOptions: { imageUrl: notification.imageUrl } };
                message.android = { notification: { imageUrl: notification.imageUrl } };
                message.webpush = { headers: { image: notification.imageUrl } };
            }
        }
        return message;
    }));
}
