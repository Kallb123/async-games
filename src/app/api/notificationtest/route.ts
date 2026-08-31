import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { consumeRateLimit } from '@/utils/rateLimit';
import { getDeviceTokens } from '@/utils/firebase/deviceTokens';
import { getNotificationPreferences, isChannelEnabled } from '@/utils/firebase/notificationPreferences';
import { homeNotificationLink, sendPushToUsers, NOTIFICATION_TEST_EVENT } from '@/utils/firebase/pushNotification';
import { buildTestNotification } from '@/utils/firebase/notificationContent';

// Enough tries to work through "turn the channel on, press again", nowhere near
// enough to use as a buzzer. Keyed on the caller, who is also the only person
// this can reach.
const TEST_LIMIT = 10;
const TEST_WINDOW_MS = 10 * 60 * 1000;

// The channel a test rides on. `yourTurn` rather than a channel of its own: the
// point of the test is to prove the notification a player actually cares about
// can reach them, and a channel with a toggle nobody would ever turn off is a
// test that proves less than it looks.
const TEST_CHANNEL = 'yourTurn';

/**
 * Sends a test push to the caller's own devices, and says what happened.
 *
 * Deliberately takes no `userId` — unlike the dev-only `/api/notifyuser`, which
 * names its target and answers 404 off a dev deployment for exactly that
 * reason. There is nothing to authorise here beyond being signed in, because
 * the only devices this can reach are the caller's own.
 *
 * Reports the three outcomes separately, because "nothing arrived" has three
 * different fixes: no device is registered (open the app on the device that has
 * gone quiet), the channel is off (the switches right above the button), or the
 * send itself failed (try again). A test that says "sent" and does nothing
 * teaches the player the wrong thing.
 */
export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }
    const user = await currentUser();
    if (!user) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }

    if (!(await consumeRateLimit('notification-test', userId, TEST_LIMIT, TEST_WINDOW_MS))) {
        return NextResponse.json({}, { status: 429, statusText: "Too many test notifications — try again shortly" });
    }

    // Both read before sending, so the two reasons a send would have reached
    // nobody are told apart from a send that genuinely failed.
    const registered = getDeviceTokens(user).filter((stored) => stored?.token).length;
    const muted = !isChannelEnabled(getNotificationPreferences(user), TEST_CHANNEL);
    if (!registered || muted) {
        return NextResponse.json({ sent: 0, registered, muted });
    }

    const sent = await sendPushToUsers([user], {
        event: NOTIFICATION_TEST_EVENT,
        link: homeNotificationLink()
    }, buildTestNotification(), {
        channel: TEST_CHANNEL
    });

    return NextResponse.json({ sent, registered, muted });
}
