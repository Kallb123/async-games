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
