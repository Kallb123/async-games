import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { CreateSmartthinkSoloGameData, SmartthinkGameDataModel } from '@/games/Smartthink/SmartthinkModels';
import { canHostGame } from '@/utils/users/clerk';

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
  // Every lobby needs a real, registered host — see canHostGame's own
  // comment (docs/account-less-play.md §8).
  if (!canHostGame(thisUser)) {
    return NextResponse.json({}, {status: 403, statusText: "Account not unlocked"});
  }

  await dbConnect();

  const username = thisUser.username || thisUser.firstName || userId;
  const gameData = CreateSmartthinkSoloGameData(userId, username, '1d');

  const gameDataM = new SmartthinkGameDataModel(gameData);
  await gameDataM.save();

  return NextResponse.json({ success: true, gameId: gameData.gameId, gameUrl: gameData.gameType.url });
}
