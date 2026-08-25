import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import { getNotificationPreferences, isChannelEnabled } from '@/utils/firebase/notificationPreferences';
import { isDevDeployment } from '@/utils/devEnvironment';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Fires a test push at a player, so a device can be checked end to end without
 * waiting for a real turn. Paired with the `/users` screen.
 *
 * Dev deployments only — off one it answers 404 as though it had never been
 * deployed, the same as the `/api/dev/*` wipes. In production this was a push
 * cannon: any signed-in player could name any user id (they are handed out by
 * `/api/friends` and the profile URLs) and buzz every device that user owns,
 * as often as they liked.
 */
export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  if (!isDevDeployment) {
    return NextResponse.json({}, { status: 404, statusText: 'Not Found' });
  }

  const authResponse = await auth();
  if (!authResponse.userId) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }

  const { userId } = await request.json();
  const user = await (await clerkClient()).users.getUser(userId);

  // A test that silently does nothing teaches you nothing, and this one would:
  // it goes out on the `yourTurn` channel like any other push, so the recipient's
  // own preferences can drop it. Say so rather than reporting a success.
  if (!isChannelEnabled(getNotificationPreferences(user), 'yourTurn')) {
    return NextResponse.json({ success: false, skipped: 'Recipient has turn notifications switched off' });
  }

  await sendPushToUsers([user], { event: 'YourTurn' }, {
    title: "Test Title",
    body: "Test Body"
  }, {
    channel: 'yourTurn'
  });

  return NextResponse.json({ success: true });
}
