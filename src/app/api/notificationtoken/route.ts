import TimedToken from '@/utils/firebase/TimedToken';
import { deviceIdForToken, parseUserAgent, toRegisteredDevice } from '@/utils/firebase/deviceInfo';
import { auth, clerkClient, currentUser, User } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

function storedTokens(user: User): TimedToken[] {
  return (user.privateMetadata?.notificationTokens as TimedToken[] | undefined) ?? [];
}

// Newest activity first, so the device you're holding tends to sit at the top.
function deviceList(tokens: TimedToken[]) {
  return tokens
    .map(toRegisteredDevice)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

async function saveTokens(user: User, tokens: TimedToken[]) {
  await (await clerkClient()).users.updateUserMetadata(user.id, {
    privateMetadata: {
      ...user.privateMetadata,
      notificationTokens: tokens
    }
  });
}

async function requireUser() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }
  return await currentUser();
}

/** Lists the signed-in user's registered devices (without their raw tokens). */
export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }

  return NextResponse.json({ devices: deviceList(storedTokens(user)) });
}

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const { token } = await request.json();
  if (!token) {
    return NextResponse.json({}, {status: 401, statusText: "Missing token from request body"});
  }

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const now = (new Date()).toISOString();
  const device = parseUserAgent(request.headers.get('user-agent'));
  const tokens = storedTokens(user);
  const existing = tokens.find((val) => val.token === token);
  if (existing) {
    // Keep the original registration time; refresh what we know about the device.
    existing.lastSeen = now;
    existing.device = device;
  } else {
    tokens.push({ token, timestamp: now, lastSeen: now, device });
  }

  await saveTokens(user, tokens);

  return NextResponse.json({success: true, devices: deviceList(tokens)});
}

/** Unregisters one device so it stops receiving pushes. */
export async function DELETE(request: NextRequest) {
  console.log(`DELETE ${request.nextUrl.pathname}`);
  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({}, { status: 400, statusText: "Missing device id from request body" });
  }

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }

  const tokens = storedTokens(user);
  const remaining = tokens.filter((val) => deviceIdForToken(val.token) !== id);
  if (remaining.length === tokens.length) {
    return NextResponse.json({}, { status: 404, statusText: "Device not found" });
  }

  await saveTokens(user, remaining);

  return NextResponse.json({ success: true, devices: deviceList(remaining) });
}
