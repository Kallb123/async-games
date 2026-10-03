import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { getPlayerStats } from '@/utils/mongodb/GameResultData';
import { profileMasteryOf } from '@/games/RealmArena/masteryRecord';

export type { MatchOutcome, IRecentMatch, IGameStats, IAchievementUnlock } from '@/utils/mongodb/GameResultData';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }

  await dbConnect();

  const [{ recent, byGame, achievements }, realmArena] = await Promise.all([
    getPlayerStats(userId, userId),
    profileMasteryOf(userId),
  ]);

  return NextResponse.json({ success: true, recent, byGame, achievements, realmArena });
}
