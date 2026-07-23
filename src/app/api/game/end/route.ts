import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { recordGameResult } from '@/utils/mongodb/GameResultData';

export async function POST(request: NextRequest) {
  const { gameId } = await request.json();
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Not signed in' }, { status: 400 });
  }

  if (!gameId) {
    return NextResponse.json({ success: false, message: 'Missing gameId' }, { status: 400 });
  }

  await dbConnect();
  const gameData = await GameDataModel.findOne({ gameId }).exec();
  if (!gameData) {
    return NextResponse.json({ success: false, message: 'Game not found' }, { status: 404 });
  }

  if (!gameData.userIdList.includes(userId)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  if (gameData.complete) {
    return NextResponse.json({ success: true, message: 'Game already ended' });
  }

  gameData.complete = true;
  gameData.winner = "";
  await gameData.save();
  await recordGameResult(gameData);

  return NextResponse.json({ success: true });
}
