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
 * Unregisters specific tokens for a user, e.g. after FCM tells us they're
 * dead. Re-reads the user first: the `User` a send path is holding may be
 * seconds old, and we must not write a stale device list back over a
 * registration that landed in the meantime. Returns how many were removed.
 */
export async function removeDeviceTokens(userId: string, tokens: string[]): Promise<number> {
    const user = await (await clerkClient()).users.getUser(userId);
    const current = getDeviceTokens(user);
    const dead = new Set(tokens);
    const remaining = current.filter((stored) => !dead.has(stored.token));

    if (remaining.length === current.length) {
        return 0;
    }

    await saveDeviceTokens(user, remaining);
    return current.length - remaining.length;
}
