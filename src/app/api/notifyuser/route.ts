import { readJsonBody } from '@/utils/api/requestBody';
import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import { buildTestNotification } from '@/utils/firebase/notificationContent';
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
 * as often as they liked. `/api/notificationtest` is the version a player is
 * allowed to have, and it can only reach the caller's own devices.
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

  const { userId } = await readJsonBody(request);
  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({}, { status: 400, statusText: "Missing userId" });
  }
  const user = await (await clerkClient()).users.getUser(userId);

  // This goes out on the `yourTurn` channel like any other push, so the
  // recipient's preferences — or having no device registered — can drop it.
  // Report the device count rather than a bare success: a test that quietly
  // does nothing and says "sent" teaches you the wrong thing.
  const devices = await sendPushToUsers([user], { event: 'YourTurn' }, buildTestNotification(), {
    channel: 'yourTurn'
  });

  return NextResponse.json({ success: devices > 0, devices });
}
