import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody } from '@/utils/api/requestBody';
import { GAME_GUIDES } from '@/utils/ui/gameGuides';
import { GAME_TUTORIALS } from '@/utils/ui/gameTutorials';
import { SeenListKey, getSeen, withSeen } from '@/utils/users/gameGuideProgress';

/** The two first-runs this route tracks, and what each is validated against
 *  and stored under. `kind` arrives from the client as a bare string, so it
 *  is matched against these two literals and used only to pick one of these
 *  two fixed entries — never to index `privateMetadata` directly, which this
 *  route reads back whole to merge and would otherwise let a signed-in caller
 *  write an arbitrary key into their own metadata via `kind`. */
const SEEN_LISTS: Record<'guide' | 'tutorial', { allowlist: Record<string, unknown>; key: SeenListKey }> = {
    guide: { allowlist: GAME_GUIDES, key: 'seenGameGuides' },
    tutorial: { allowlist: GAME_TUTORIALS, key: 'seenGameTutorials' },
};

// GET: which games' guides and tutorials this account has already been
// auto-shown.
// POST { game, kind }: mark one as shown, so it never auto-shows again for
// this account. `kind` defaults to 'guide'. Same shape as
// /api/notificationpreferences — read/write a slice of the signed-in user's
// privateMetadata.
export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    const user = await currentUser();
    if (!user) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    return NextResponse.json({
        seen: getSeen(user, SEEN_LISTS.guide.key),
        seenTutorials: getSeen(user, SEEN_LISTS.tutorial.key),
    });
}

export async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    const body = await readJsonBody<{ game: string; kind?: string }>(request);
    const kind = body.kind === 'tutorial' ? 'tutorial' : 'guide';
    const list = SEEN_LISTS[kind];
    if (!body.game || typeof body.game !== 'string' || !(body.game in list.allowlist)) {
        return NextResponse.json({}, { status: 400, statusText: 'Missing game' });
    }

    const currentUserData = await currentUser();
    if (!currentUserData) {
        return NextResponse.json({}, { status: 400, statusText: 'Not signed in' });
    }

    const seen = withSeen(currentUserData, list.key, body.game);
    await (await clerkClient()).users.updateUserMetadata(userId, {
        privateMetadata: {
            ...currentUserData.privateMetadata,
            [list.key]: seen,
        }
    });

    return NextResponse.json({ seen });
}
