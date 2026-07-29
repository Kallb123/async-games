import { clerkClient, User } from '@clerk/nextjs/server';
import TimedToken from './TimedToken';

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
