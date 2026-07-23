import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameResultModel } from '@/utils/mongodb/GameResultData';

export type MatchOutcome = "win" | "loss" | "draw";

export interface IRecentMatch {
  gameId: string;
  url: string;
  endedAt: string;
  outcome: MatchOutcome;
}

export interface IGameStats {
  url: string;
  wins: number;
  losses: number;
  draws: number;
  total: number;
}

function outcomeFor(winner: string, userId: string): MatchOutcome {
  if (winner === userId) return "win";
  if (winner === "") return "draw";
  return "loss";
}

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }

  await dbConnect();

  const recentResults = await GameResultModel
    .find({ playerIds: userId })
    .sort({ endedAt: -1 })
    .limit(10)
    .exec();

  const recent: IRecentMatch[] = recentResults.map(result => ({
    gameId: result.gameId,
    url: result.url,
    endedAt: result.endedAt,
    outcome: outcomeFor(result.winner, userId),
  }));

  const byGameAgg: { _id: string, wins: number, losses: number, draws: number, total: number }[] = await GameResultModel.aggregate([
    { $match: { playerIds: userId } },
    { $group: {
      _id: '$url',
      total: { $sum: 1 },
      wins: { $sum: { $cond: [{ $eq: ['$winner', userId] }, 1, 0] } },
      draws: { $sum: { $cond: [{ $eq: ['$winner', ''] }, 1, 0] } },
      losses: { $sum: { $cond: [{ $and: [{ $ne: ['$winner', userId] }, { $ne: ['$winner', ''] }] }, 1, 0] } },
    } },
    { $sort: { total: -1 } },
  ]);

  const byGame: IGameStats[] = byGameAgg.map(({ _id, wins, losses, draws, total }) => ({
    url: _id, wins, losses, draws, total,
  }));

  return NextResponse.json({ success: true, recent, byGame });
}
