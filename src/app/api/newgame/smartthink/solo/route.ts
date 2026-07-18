import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { CreateSmartthinkSoloGameData, SmartthinkGameDataModel } from '@/games/Smartthink/SmartthinkModels';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  await dbConnect();

  const username = thisUser.username || thisUser.firstName || userId;
  const gameData = CreateSmartthinkSoloGameData(userId, username, '1d');

  const gameDataM = new SmartthinkGameDataModel(gameData);
  await gameDataM.save();

  return NextResponse.json({ success: true, gameId: gameData.gameId, gameUrl: gameData.gameType.url });
}
