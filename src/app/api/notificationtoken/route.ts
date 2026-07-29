import TimedToken from '@/utils/firebase/TimedToken';
import { deviceIdForToken, parseUserAgent, pruneStaleTokens, toRegisteredDevice } from '@/utils/firebase/deviceInfo';
import { getDeviceTokens, removeDevices, saveDeviceTokens } from '@/utils/firebase/deviceTokens';
import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

// Newest activity first, so the device you're holding tends to sit at the top.
function deviceList(tokens: TimedToken[]) {
  return tokens
    .map(toRegisteredDevice)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
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

  // Pruned for display only; the nightly cron does the actual forgetting.
  return NextResponse.json({ devices: deviceList(pruneStaleTokens(getDeviceTokens(user))) });
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
  // Registering is also the natural moment to forget this user's dead devices.
  const tokens = pruneStaleTokens(getDeviceTokens(user));
  const existing = tokens.find((val) => val.token === token);
  if (existing) {
    // Keep the original registration time; refresh what we know about the device.
    existing.lastSeen = now;
    existing.device = device;
  } else {
    tokens.push({ token, timestamp: now, lastSeen: now, device });
  }

  await saveDeviceTokens(user, tokens);

  return NextResponse.json({success: true});
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

  const { removed, remaining } = await removeDevices(user.id, (stored) => deviceIdForToken(stored.token) === id);
  if (!removed) {
    return NextResponse.json({}, { status: 404, statusText: "Device not found" });
  }

  return NextResponse.json({ success: true, devices: deviceList(remaining) });
}
