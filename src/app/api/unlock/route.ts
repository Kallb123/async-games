import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { clientIp, consumeRateLimit } from '@/utils/rateLimit';
import { readJsonBody } from '@/utils/api/requestBody';
import { timingSafeStringEqual } from '@/utils/secrets';

// The invite gate is the app's front door, and the only endpoint where
// guessing pays: one shared password, and a correct guess unlocks an account
// permanently. Ten attempts an hour, counted per account *and* per IP — per
// account alone would let someone with a pile of signups spread the guessing
// out, and per IP alone would rate-limit a household off one bad try.
const UNLOCK_LIMIT = 10;
const UNLOCK_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const { password } = await readJsonBody(request);
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

  if (typeof password !== 'string' || !timingSafeStringEqual(password, accessPassword)) {
    // Only a wrong guess spends the budget — a correct unlock below never
    // calls consumeRateLimit at all. Gated on its own atomic increment-and-
    // check, not a separate read first: two guesses racing each other both
    // still land on a count consumeRateLimit itself computed, so neither can
    // slip through on a stale read the other's write already overtook.
    const withinLimit = await Promise.all([
      consumeRateLimit('unlock-user', userId, UNLOCK_LIMIT, UNLOCK_WINDOW_MS),
      consumeRateLimit('unlock-ip', clientIp(request.headers), UNLOCK_LIMIT, UNLOCK_WINDOW_MS),
    ]);
    if (withinLimit.includes(false)) {
      return NextResponse.json(
        {error: "Too many attempts. Please try again later."},
        {status: 429, statusText: "Too many attempts"},
      );
    }

    await setUnlocked(false);
    return NextResponse.json({error: "Incorrect password. Please try again."}, {status: 400, statusText: "Incorrect password"});
  }

  await setUnlocked(true);

  return NextResponse.json({success: true});
}
