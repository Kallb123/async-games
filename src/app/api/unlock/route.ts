import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const { password } = await request.json();
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({error: "You're not signed in."}, {status: 400, statusText: "Not signed in"});
  }

  const setUnlocked = async (unlocked: boolean) => {
    await (await clerkClient()).users.updateUserMetadata(userId, { publicMetadata: { unlocked } });
  };

  // Trimmed because a value pasted into a dashboard env var picks up a trailing
  // newline easily, and that shouldn't reject the right password.
  const accessPassword = process.env.ACCESS_PASSWORD?.trim();

  if (!accessPassword) {
    // No password configured is a deployment problem, not a wrong guess: say so
    // rather than locking the account out on every attempt.
    console.error('ACCESS_PASSWORD is not set in this environment');
    return NextResponse.json(
      {error: "No access password is configured for this deployment."},
      {status: 500, statusText: "Access password not configured"},
    );
  }

  if (password !== accessPassword) {
    await setUnlocked(false);
    return NextResponse.json({error: "Incorrect password. Please try again."}, {status: 400, statusText: "Incorrect password"});
  }

  await setUnlocked(true);

  return NextResponse.json({success: true});
}
