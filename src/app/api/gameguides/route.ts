import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody } from '@/utils/api/requestBody';
import { getSeenGameGuides, withGameGuideSeen } from '@/utils/users/gameGuideProgress';

// GET: which games' guides this account has already been auto-shown.
// POST { game }: mark one as shown, so it never auto-shows again for this
// account. Same shape as /api/notificationpreferences — read/write a slice of
// the signed-in user's privateMetadata.
export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    const user = await currentUser();
    if (!user) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    return NextResponse.json({ seen: getSeenGameGuides(user) });
}

export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    const body = await readJsonBody<{ game: string }>(request);
    if (!body.game || typeof body.game !== 'string') {
        return NextResponse.json({}, { status: 400, statusText: 'Missing game' });
    }

    const currentUserData = await currentUser();
    if (!currentUserData) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    const seen = withGameGuideSeen(currentUserData, body.game);
    await (await clerkClient()).users.updateUserMetadata(userId, {
        privateMetadata: {
            ...currentUserData.privateMetadata,
            seenGameGuides: seen,
        }
    });

    return NextResponse.json({ seen });
}
