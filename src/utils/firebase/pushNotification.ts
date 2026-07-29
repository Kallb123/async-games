import { User } from '@clerk/nextjs/server';
import { BatchResponse, Message } from 'firebase-admin/messaging';
import { getAdminMessaging } from './adminFirebase';
import { getDeviceTokens, removeDevices } from './deviceTokens';
import { deadTokensByUser, PushTarget } from './revokedTokens';
import { getNotificationPreferences, isChannelEnabled, NotificationChannel } from './notificationPreferences';

export interface PushNotification {
    title: string;
    body?: string;
    imageUrl?: string;
}

// Origin used to build links in push notifications. Override with the
// APP_URL env var per deployment (e.g. a staging environment); falls back to
// production so nothing breaks where it isn't set.
const APP_BASE_URL = process.env.APP_URL ?? 'https://async-games.vercel.app';

// Absolute URL the service worker opens (`firebase-messaging-sw.js`'s
// `notificationclick` handler reads `data.link`) when a notification is
// tapped. Include this in `data` alongside any `notification` payload, or
// tapping the notification won't take the player anywhere.
export function gameNotificationLink(gameTypeUrl: string, gameId: string): string {
    return `${APP_BASE_URL}/games/${gameTypeUrl}/${gameId}`;
}

export function homeNotificationLink(): string {
    return APP_BASE_URL;
}

export function profileNotificationLink(): string {
    return `${APP_BASE_URL}/profile`;
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
    const targets: PushTarget[] = users
        .filter((user) => {
            if (!options.channel) {
                return true;
            }
            const prefs = getNotificationPreferences(user);
            return isChannelEnabled(prefs, options.channel);
        })
        .flatMap((user) => getDeviceTokens(user)
            .filter((stored) => stored?.token)
            .map((stored) => ({ userId: user.id, token: stored.token })));
    if (!targets.length) {
        return;
    }
    console.log(`Sending ${data.event ?? notification?.title ?? 'push'} to ${targets.length} device token(s)`);
    const messaging = getAdminMessaging();
    const response = await messaging.sendEach(targets.map((target) => {
        const message: Message = {
            token: target.token,
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

    await forgetDeadTokens(targets, response);
}

/**
 * FCM is the only thing that knows a token has been revoked — the device
 * can't tell us, it's gone. Every send is therefore a free liveness check, so
 * we harvest it. Cleanup failures are logged and swallowed: the push itself
 * already succeeded, and a stale token costs nothing until the next send.
 */
async function forgetDeadTokens(targets: PushTarget[], response: BatchResponse) {
    if (!response.failureCount) {
        return;
    }

    for (const [userId, tokens] of deadTokensByUser(targets, response.responses)) {
        try {
            const dead = new Set(tokens);
            const { removed } = await removeDevices(userId, (stored) => dead.has(stored.token));
            if (removed) {
                console.log(`Removed ${removed} revoked device token(s) for user ${userId}`);
            }
        } catch (error) {
            console.error(`Failed to remove revoked device token(s) for user ${userId}`, error);
        }
    }
}
