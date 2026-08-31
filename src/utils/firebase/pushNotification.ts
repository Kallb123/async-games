import { User } from '@clerk/nextjs/server';
import { BatchResponse, Message } from 'firebase-admin/messaging';
import { getAdminMessaging } from './adminFirebase';
import { getDeviceTokens, removeDevices } from './deviceTokens';
import { deadTokensByUser, PushTarget } from './revokedTokens';
import { getNotificationPreferences, isChannelEnabled, NotificationChannel } from './notificationPreferences';
import { gamePath, metaForGame } from '@/utils/ui/games';
import { APP_BASE_URL } from '@/utils/app';

export interface PushNotification {
    title: string;
    body?: string;
    imageUrl?: string;
}

// Absolute URL the service worker opens (`firebase-messaging-sw.js`'s
// `notificationclick` handler reads `data.link`) when a notification is
// tapped. Include this in `data` alongside any `notification` payload, or
// tapping the notification won't take the player anywhere.
export function gameNotificationLink(gameTypeUrl: string, gameId: string): string {
    return `${APP_BASE_URL}${gamePath(gameTypeUrl, gameId)}`;
}

export function homeNotificationLink(): string {
    return APP_BASE_URL;
}

export function profileNotificationLink(): string {
    return `${APP_BASE_URL}/profile`;
}

// Absolute URL of a game's artwork, for the `imageUrl` of a notification about
// that game. Derived from the game's own metadata (the single source of truth
// for its art) so a notification can never show another game's icon, and
// undefined for games that only have a glyph — FCM rejects a broken image URL
// on some platforms, so it's better to send none.
export function gameNotificationImage(gameTypeUrl: string): string | undefined {
    const art = metaForGame({ url: gameTypeUrl })?.art;
    return art ? `${APP_BASE_URL}${art}` : undefined;
}

/**
 * The `data.event` of the "does push work at all?" push behind Settings' Test
 * button (`/api/notificationtest`).
 *
 * The one push the service worker displays even when the app is open. Every
 * other push is deliberately not shown then — the screen updates instead —
 * which would make a test button press look like a failure every time, since
 * the person pressing it is by definition looking at the app.
 *
 * `public/firebase-messaging-sw.js` has to carry the same string as a literal
 * (a static worker can't import from here); `serviceWorker.test.ts` holds the
 * two together.
 */
export const NOTIFICATION_TEST_EVENT = 'NotificationTest';

// How long a push is worth delivering for. FCM's web default is four weeks,
// which is far past the point where "your move" is news: a phone that has been
// off for a day comes back to a turn it can still take, one that has been off
// for a month comes back to a game the turn timer has long since moved on.
const WEB_PUSH_TTL_SECONDS = 24 * 60 * 60;

export interface SendPushOptions {
    /** Which notification channel this push belongs to. The push is skipped for
     *  any user whose preferences disable that channel, or who has turned
     *  notifications off entirely. Required — see `sendPushToUsers`. */
    channel: NotificationChannel;
}

/**
 * The notification `tag` the service worker shows this push under. Without one,
 * every push stacks: a player away for a day comes back to six "Your move in
 * Train Time" rows for the same game, which is its own reason to turn
 * notifications off. Tagging by kind *and* by whatever the push is about means
 * a second "your move" in one game replaces the first, while a nudge in that
 * game still arrives beside it.
 */
function tagFor(data: Record<string, string>): string {
    const subject = data.gameId ?? data.inviteId ?? data.friendshipId;
    return [data.event, subject].filter(Boolean).join(':') || 'async-games';
}

/**
 * Sends a push to every registered device of the given users.
 *
 * Both the notification and the channel are required, and deliberately so: a
 * data-only message displays nothing on arrival, and iOS punishes an app for
 * sending those. `usePushEvents` has the full account and what replaced them;
 * this signature is what stops one being written again.
 *
 * Returns how many devices it reached — zero when every recipient has this
 * channel switched off, and zero when the send itself failed, which it reports
 * rather than throws (see the try below). Only the dev test bench reads it —
 * everything else sends and moves on.
 */
export async function sendPushToUsers(
    users: User[],
    data: Record<string, string>,
    notification: PushNotification,
    options: SendPushOptions
) {
    const targets: PushTarget[] = users
        .filter((user) => isChannelEnabled(getNotificationPreferences(user), options.channel))
        .flatMap((user) => getDeviceTokens(user)
            .filter((stored) => stored?.token)
            .map((stored) => ({ userId: user.id, token: stored.token })));
    if (!targets.length) {
        return 0;
    }
    console.log(`Sending ${data.event ?? notification.title} to ${targets.length} device token(s)`);
    const payload = { ...data, tag: tagFor(data) };

    // Sending never throws at its caller. A push is something that happens
    // *because* of a turn, an invite or a game ending — never something those
    // are waiting on — so an FCM outage, a bad service-account credential or a
    // network blip must not turn a write that already landed into a failure
    // the player sees. It did: the opening push in startGameFromInvitation and
    // the invite push in every /api/newgame route are both awaited after their
    // document is saved, so a Firebase wobble answered "couldn't start your
    // game" for a game that had started, and the retry made a second invite.
    // The turntimer cron had it worse still — one failed send ended the sweep.
    //
    // Reports how many devices it actually reached, so a caller that cares
    // (the dev test bench) can tell "sent to nobody" from "sent".
    try {
        const messaging = getAdminMessaging();
        const response = await messaging.sendEach(targets.map((target) => {
            const message: Message = {
                token: target.token,
                data: payload,
                notification: {
                    title: notification.title,
                    body: notification.body,
                    imageUrl: notification.imageUrl
                }
            };
            // Web push travels through the browser's own push service, which
            // is free to sit on a normal-urgency message until the device next
            // wakes for some other reason — minutes to hours on an Android
            // phone in Doze. Every push this app sends is a turn, an invite or
            // a result that is worth waking a phone for, so all of them say so.
            //
            // Headers are the whole of the useful webpush config here:
            // `webpush.notification` and `webpush.fcmOptions.link` would both
            // be inert, because `firebase-messaging-sw.js` strips the
            // notification payload and builds the notification — and handles
            // the tap, off `data.link` — itself.
            message.webpush = {
                headers: {
                    Urgency: 'high',
                    TTL: `${WEB_PUSH_TTL_SECONDS}`,
                },
            };
            if (notification.imageUrl) {
                message.apns = { fcmOptions: { imageUrl: notification.imageUrl } };
                message.android = { notification: { imageUrl: notification.imageUrl } };
            }
            return message;
        }));

        await forgetDeadTokens(targets, response);

        return targets.length - response.failureCount;
    } catch (error) {
        console.error(`Failed to send ${data.event ?? notification.title} to ${targets.length} device token(s)`, error);
        return 0;
    }
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
