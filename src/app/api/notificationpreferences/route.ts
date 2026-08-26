import { readJsonBody } from '@/utils/api/requestBody';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { ALL_NOTIFICATION_CHANNELS, buildDefaultNotificationPreferences, getNotificationPreferences, NotificationChannel, NotificationPreferences } from '@/utils/firebase/notificationPreferences';

export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    const user = await currentUser();
    if (!user) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    return NextResponse.json({ preferences: getNotificationPreferences(user) });
}

export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    const body = await readJsonBody(request);
    const currentUserData = await currentUser();
    if (!currentUserData) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    const current = getNotificationPreferences(currentUserData);
    const next: NotificationPreferences = {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
        channels: { ...current.channels }
    };

    const requestedChannels = body.channels;
    if (requestedChannels && typeof requestedChannels === 'object' && !Array.isArray(requestedChannels)) {
        const requested = requestedChannels as Record<string, unknown>;
        for (const channel of ALL_NOTIFICATION_CHANNELS) {
            const value = requested[channel];
            if (typeof value === 'boolean') {
                next.channels[channel] = value;
            }
        }
    }

    // If this is the first time saving preferences, ensure all defaults are present.
    const defaults = buildDefaultNotificationPreferences();
    for (const channel of ALL_NOTIFICATION_CHANNELS) {
        if (!(channel in next.channels)) {
            next.channels[channel] = defaults.channels[channel];
        }
    }

    await (await clerkClient()).users.updateUserMetadata(userId, {
        privateMetadata: {
            ...currentUserData.privateMetadata,
            notificationPreferences: next
        }
    });

    return NextResponse.json({ preferences: next });
}
