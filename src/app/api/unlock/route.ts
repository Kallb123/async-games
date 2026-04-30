import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const { password } = await request.json();
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  if (password !== process.env.ACCESS_PASSWORD) {
    await (await clerkClient()).users.updateUserMetadata(userId, {
      publicMetadata: {
        unlocked: false
      }
    });
    return NextResponse.json({}, {status: 400, statusText: "Incorrect password"});
  }

  await (await clerkClient()).users.updateUserMetadata(userId, {
    publicMetadata: {
      unlocked: true
    }
  });

  return NextResponse.json({success: true});
}
