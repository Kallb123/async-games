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

    const body = await request.json();
    const currentUserData = await currentUser();
    if (!currentUserData) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    const current = getNotificationPreferences(currentUserData);
    const next: NotificationPreferences = {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
        channels: { ...current.channels }
    };

    if (body.channels && typeof body.channels === 'object') {
        for (const channel of ALL_NOTIFICATION_CHANNELS) {
            if (typeof body.channels[channel] === 'boolean') {
                next.channels[channel] = body.channels[channel];
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
