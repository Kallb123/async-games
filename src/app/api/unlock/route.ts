import { auth, clerkClient } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const { userId } = auth();

  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  if (password !== process.env.ACCESS_PASSWORD) {
    await clerkClient.users.updateUserMetadata(userId, {
      publicMetadata: {
        unlocked: false
      }
    });
    return NextResponse.json({}, {status: 400, statusText: "Incorrect password"});
  }

  await clerkClient.users.updateUserMetadata(userId, {
    publicMetadata: {
      unlocked: true
    }
  });

  return NextResponse.json({success: true});
}
