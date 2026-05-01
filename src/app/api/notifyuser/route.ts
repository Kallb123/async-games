import TimedToken from '@/utils/firebase/TimedToken';
import { getAdminMessaging } from '@/utils/firebase/adminFirebase';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const authResponse = await auth();

  if (!authResponse.userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  
  const { userId } = await request.json();
  const user = await (await clerkClient()).users.getUser(userId);

  const messaging = getAdminMessaging();
  const tokens = user.privateMetadata.notificationTokens as TimedToken[];
  messaging.sendEach(tokens.map((token) => {
      return {
          token: token.token,
          notification: {
              title: "Test Title",
              body: "Test Body"
          }
      }
  }));

  return NextResponse.json({success: true});
}
