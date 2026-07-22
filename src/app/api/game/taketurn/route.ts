import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';

export async function POST(request: NextRequest) {
  console.log(`${request.method} ${request.nextUrl.pathname}`);

  const authResponse = await auth();
  if (!authResponse.userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  
  const { gameId } = await request.json();

  await dbConnect();
  const gameData: IGameDataDocument = await GameDataModel.findOne({gameId}).exec();

  if (gameData.currentTurn !== authResponse.userId) {
    return NextResponse.json({}, {status: 401, statusText: "Not your turn"});
  }

  const currentIndex = gameData.gameState.turnOrder.findIndex(to => to === gameData.currentTurn);
  const nextTurn = gameData.gameState.turnOrder[(currentIndex+1)%gameData.gameState.turnOrder.length];
  gameData.currentTurn = nextTurn;
  gameData.lastTurnTimestamp = new Date().toISOString();
  gameData.timerWarningNotificationSent = false;

  const { data: userList } = await (await clerkClient()).users.getUserList({
    userId: gameData.userIdList
  });
  const turnUser = userList.find(u => u.id === gameData.currentTurn);

  if (!turnUser) {
    return NextResponse.json({}, {status: 400, statusText: "Next user not found"});
  }

  await gameData.save();

  await sendPushToUsers(userList, {
    event: 'TurnTaken',
    gameId
  });

  await sendPushToUsers([turnUser], {
    event: 'YourTurn',
    gameId
  }, {
    title: "Your Turn",
    body: `It's your turn to play!`
  }, {
    channel: 'yourTurn'
  });

  return NextResponse.json({success: true});
}
