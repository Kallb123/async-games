import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { completedGameResults, completedGameUserIds, toCompletedGames } from '@/utils/dashboard';
import { buildUserDirectory } from '@/utils/users/clerk';

/**
 * Finished games on their own, for the full-history page. The home screen gets
 * the same list inside /api/dashboard — both build it from the same two
 * helpers, so the two routes cannot drift.
 */
export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  await dbConnect();

  const results = await completedGameResults(userId);
  const directory = await buildUserDirectory(completedGameUserIds(results));

  return NextResponse.json({success: true, gameList: toCompletedGames(results, directory)});
}
