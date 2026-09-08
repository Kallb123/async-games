// The copy for "this device is not going to be told it's your turn", shared by
// every place that has to say it: the offer card, the footer that follows a
// player around the app, and the popup that catches a declined permission
// prompt. Notifications are how an async game tells you there is something to
// do, so a device that cannot receive one is a broken app rather than a
// preference — and all three places have to say so in the same words.

import { isNativeShell } from '@/utils/native';

/**
 * Why this device will not receive a push, in the order the three
 * preconditions have to line up (see `PushRegistrationState`): the platform
 * has to support push at all, permission has to be asked for and granted, and
 * the device has to register itself.
 */
export type NotificationBlocker =
    /** No Notification API, no service worker, or iOS before it is installed. */
    | 'unsupported'
    /** Permission has never been asked for on this device. */
    | 'unasked'
    /** Permission was asked for and refused, so it cannot be asked for again. */
    | 'blocked'
    /** Permission is granted, but the device never registered for a token. */
    | 'unregistered';

/**
 * The consequence, said once. Every surface leads with this line, because the
 * consequence is the part a player cares about — the specific blocker below is
 * only what they have to do about it.
 */
export const NOTIFICATION_MISS_LINE =
    "Async Games can't let you know when it's your turn on this device — you'll only find out by opening the app and looking.";

/** Which of the three preconditions is missing, and what fixes it. */
export function notificationBlockerLine(blocker: NotificationBlocker): string {
    switch (blocker) {
        case 'unsupported':
            return isNativeShell()
                ? "This app build can't receive notifications."
                : "This browser can't receive notifications. Open Async Games in Chrome, Edge or Safari, or install it to your home screen.";
        case 'unasked':
            return 'Notifications have not been turned on for this device yet.';
        case 'blocked':
            // The one blocker the app cannot act on from script: a browser that
            // has been told no will not ask again, so the copy has to name the
            // settings screen the player has to go to themselves — and in the
            // native shell that is Android's, because there is no browser in
            // there to go looking for.
            return isNativeShell()
                ? 'Notifications are turned off for Async Games. Allow them in Android’s app settings to hear about invites and turns.'
                : 'Notifications are blocked for this site. Allow them in your browser’s site settings to hear about invites and turns.';
        case 'unregistered':
            return "Notifications are allowed here, but this device couldn't register for them.";
    }
}
