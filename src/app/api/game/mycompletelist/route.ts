import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { userIdListToUsernameMap } from '@/utils/users/clerk';
import { GAME_META } from '@/utils/ui/games';

export interface ICompletedGame {
  gameId: string;
  url: string;
  friendlyName: string;
  winner: string;
  endedAt: string;
}

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  await dbConnect();

  const results = await GameResultModel.find({ playerIds: userId }).sort({ endedAt: -1 }).exec();

  const winnerIds = [...new Set(results.map(result => result.winner).filter(Boolean))];
  const usernameById = await userIdListToUsernameMap(winnerIds);

  const gameList: ICompletedGame[] = results.map(result => ({
    gameId: result.gameId,
    url: result.url,
    friendlyName: GAME_META[result.url]?.name ?? result.url,
    winner: result.winner ? (usernameById.get(result.winner) ?? result.winner) : "",
    endedAt: result.endedAt,
  }));

  return NextResponse.json({success: true, gameList});
}
