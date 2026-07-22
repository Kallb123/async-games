import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';

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

  const { gameId } = await request.json();
  if (!gameId) {
    return NextResponse.json({}, {status: 400, statusText: "Missing gameId"});
  }

  await dbConnect();
  const gameData: IGameDataDocument = await GameDataModel.findOne({gameId}).exec();
  if (!gameData) {
    return NextResponse.json({}, {status: 404, statusText: "Game not found"});
  }

  if (!gameData.userIdList.includes(userId)) {
    return NextResponse.json({}, {status: 403, statusText: "Not a player in this game"});
  }

  if (gameData.complete) {
    return NextResponse.json({}, {status: 400, statusText: "Game is already complete"});
  }

  if (gameData.currentTurn === userId) {
    return NextResponse.json({}, {status: 400, statusText: "It's already your turn"});
  }

  const turnUser = await (await clerkClient()).users.getUser(gameData.currentTurn);
  const nudgerName = thisUser.username || thisUser.firstName || "Someone";

  await sendPushToUsers([turnUser], {
    event: 'TurnNudge',
    gameId
  }, {
    title: "👉 Nudge!",
    body: `${nudgerName} is waiting for your move in ${gameData.gameType.friendlyName}`
  }, {
    channel: 'turnNudge'
  });

  return NextResponse.json({success: true});
}
