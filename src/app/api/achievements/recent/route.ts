import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { unlocksOf } from '@/utils/mongodb/AchievementUnlockData';
import { ACHIEVEMENT_NEWS_MS } from '@/utils/games/achievements';

export type { IAchievementUnlock } from '@/utils/mongodb/AchievementUnlockData';

// The caller's own unlocks from the last week: the feed the app-wide toaster
// reads, so an unlock is celebrated on whatever screen the player is on
// (docs/achievements.md §6, §7.3). No existing response is fetched on every
// screen, so this is the smallest route that does the job: signed in, your own
// and nobody else's, no parameters to forge, one indexed read bounded by the
// catalogue's size, and no write. A week, because that is how long the toaster
// treats an unlock as news — anything older isn't.
export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 401, statusText: "Not signed in" });
    }

    await dbConnect();

    const since = new Date(Date.now() - ACHIEVEMENT_NEWS_MS).toISOString();
    return NextResponse.json({ success: true, unlocks: await unlocksOf(userId, since) });
}
