import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { getPlayerStats } from '@/utils/mongodb/GameResultData';

export type { MatchOutcome, IRecentMatch, IGameStats } from '@/utils/mongodb/GameResultData';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }

  await dbConnect();

  const { recent, byGame } = await getPlayerStats(userId, userId);

  return NextResponse.json({ success: true, recent, byGame });
}
