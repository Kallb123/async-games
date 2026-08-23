import { pruneStaleTokens, STALE_DEVICE_DAYS } from '@/utils/firebase/deviceInfo';
import { getDeviceTokens, saveDeviceTokens } from '@/utils/firebase/deviceTokens';
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorisedCron } from '@/utils/cronAuth';
import { forEachClerkUser } from '@/utils/users/clerk';

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

    let usersUpdated = 0;
    let devicesRemoved = 0;

    const scanned = await forEachClerkUser(async user => {
        const tokens = getDeviceTokens(user);
        if (!tokens.length) {
            return;
        }

        const kept = pruneStaleTokens(tokens);
        if (kept.length === tokens.length) {
            return;
        }

        await saveDeviceTokens(user, kept);
        usersUpdated++;
        devicesRemoved += tokens.length - kept.length;
    });

    console.log(`Removed ${devicesRemoved} device(s) unused for ${STALE_DEVICE_DAYS}+ days across ${usersUpdated} user(s)`);

    return NextResponse.json({ scanned, usersUpdated, devicesRemoved, staleAfterDays: STALE_DEVICE_DAYS });
}
