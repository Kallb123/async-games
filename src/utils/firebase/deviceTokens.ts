import { clerkClient, User } from '@clerk/nextjs/server';
import TimedToken from './TimedToken';
import { pruneStaleTokens } from './deviceInfo';

/**
 * Reading and writing a user's registered push devices in Clerk private
 * metadata. Server-only — keep the pure/display side in `deviceInfo.ts` so the
 * client can import it.
 */

export function getDeviceTokens(user: User): TimedToken[] {
    return (user.privateMetadata?.notificationTokens as TimedToken[] | undefined) ?? [];
}

export async function saveDeviceTokens(user: User, tokens: TimedToken[]) {
    await (await clerkClient()).users.updateUserMetadata(user.id, {
        privateMetadata: {
            ...user.privateMetadata,
            notificationTokens: tokens
        }
    });
}

/**
 * Registers (or refreshes) one device against a user, and prunes the list
 * while it's there.
 *
 * Re-reads the user first, for the reason removeDevices does: the caller's
 * `User` came from `currentUser()` and the whole list is written back as one
 * metadata object, so a registration that landed in between — the same person
 * opening the app on a second device, or a foreground refresh racing the tab
 * that woke it — would be erased by this write rather than merged with it.
 */
export async function registerDevice(
    userId: string,
    token: string,
    device: TimedToken['device'],
    now: string
): Promise<void> {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);

    const tokens = pruneStaleTokens(getDeviceTokens(user));
    const existing = tokens.find((stored) => stored.token === token);
    if (existing) {
        // Keep the original registration time; refresh what we know about the device.
        existing.lastSeen = now;
        existing.device = device;
    } else {
        tokens.push({ token, timestamp: now, lastSeen: now, device });
    }

    // Pruned again after the push, so a list that was exactly at the cap and
    // has just gained a device comes back down to it.
    await saveDeviceTokens(user, pruneStaleTokens(tokens));
}

/**
 * Unregisters every device matching `matches` — one the user tapped remove on,
 * or a batch FCM has told us is dead. Re-reads the user first: the caller's
 * `User` may be seconds old, and we must not write a stale device list back
 * over a registration that landed in the meantime.
 */
export async function removeDevices(
    userId: string,
    matches: (stored: TimedToken) => boolean
): Promise<{ removed: number; remaining: TimedToken[] }> {
    const user = await (await clerkClient()).users.getUser(userId);
    const current = getDeviceTokens(user);
    const remaining = current.filter((stored) => !matches(stored));

    if (remaining.length !== current.length) {
        await saveDeviceTokens(user, remaining);
    }

    return { removed: current.length - remaining.length, remaining };
}
