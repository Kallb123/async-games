import { sendPushToUsers } from '@/utils/firebase/pushNotification';
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

  await sendPushToUsers([user], {}, {
    title: "Test Title",
    body: "Test Body"
  });

  return NextResponse.json({success: true});
}
