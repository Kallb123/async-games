import { pruneStaleTokens, STALE_DEVICE_DAYS } from '@/utils/firebase/deviceInfo';
import { getDeviceTokens, saveDeviceTokens } from '@/utils/firebase/deviceTokens';
import { clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorisedCron } from '@/utils/cronAuth';

const PAGE_SIZE = 100;
// Belt and braces against a paging bug turning into an unbounded loop.
const MAX_PAGES = 100;

/**
 * Forgets push registrations from devices that haven't checked in for
 * STALE_DEVICE_DAYS. Every visit to the app refreshes a device's `lastSeen`,
 * so anything this removes is a phone that's been wiped, replaced or simply
 * unused for months — and its FCM token is dead weight we'd otherwise keep
 * sending to forever.
 */
export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    if (!isAuthorisedCron(request)) {
        return NextResponse.json({}, { status: 401, statusText: 'Unauthorized' });
    }

    const client = await clerkClient();

    let scanned = 0;
    let usersUpdated = 0;
    let devicesRemoved = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
        const { data: users } = await client.users.getUserList({
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE
        });
        if (!users.length) {
            break;
        }
        scanned += users.length;

        for (const user of users) {
            const tokens = getDeviceTokens(user);
            if (!tokens.length) {
                continue;
            }

            const kept = pruneStaleTokens(tokens);
            if (kept.length === tokens.length) {
                continue;
            }

            await saveDeviceTokens(user, kept);
            usersUpdated++;
            devicesRemoved += tokens.length - kept.length;
        }

        if (users.length < PAGE_SIZE) {
            break;
        }
    }

    console.log(`Removed ${devicesRemoved} device(s) unused for ${STALE_DEVICE_DAYS}+ days across ${usersUpdated} user(s)`);

    return NextResponse.json({ scanned, usersUpdated, devicesRemoved, staleAfterDays: STALE_DEVICE_DAYS });
}
