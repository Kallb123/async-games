import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { after, NextRequest, NextResponse } from 'next/server';
import { GameDataModel, IGameDataDocument, trySave } from '@/utils/mongodb/GameData';
import { userListToUserIdNameMap } from '@/utils/users/clerk';

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

  // They acted within their turn window, so they haven't missed this one —
  // clear any run of expiries the turntimer cron had counted against them.
  if (gameData.missedTurnCounts?.get(gameData.currentTurn)) {
    gameData.missedTurnCounts.set(gameData.currentTurn, 0);
  }

  const currentIndex = gameData.gameState.turnOrder.findIndex(to => to === gameData.currentTurn);
  const nextTurn = gameData.gameState.turnOrder[(currentIndex+1)%gameData.gameState.turnOrder.length];
  gameData.currentTurn = nextTurn;
  gameData.lastTurnTimestamp = new Date().toISOString();
  gameData.timerWarningNotificationSent = false;

  if (!(await trySave(gameData))) {
    return NextResponse.json({}, {status: 409, statusText: "Game state changed, please refresh and try again"});
  }

  // Notifying the next player — the Clerk lookup and building their "your move"
  // body (which replays the whole game through the recap engine) — is the
  // slowest part of ending a turn and none of it is anything the player who
  // just moved is waiting on. Run it after the response has flushed. A failure
  // here can't cost a turn advance that's already saved, so it's logged and
  // swallowed rather than an error.
  after(async () => {
    try {
      const { data: userList } = await (await clerkClient()).users.getUserList({
        userId: gameData.userIdList
      });
      const turnUser = userList.find(u => u.id === gameData.currentTurn);

      if (!turnUser) {
        console.error(`Next user not found for game ${gameData.gameId}`);
        return;
      }

      await sendPushToUsers([turnUser], {
        event: 'YourTurn',
        gameId,
        link: gameNotificationLink(gameData.gameType.url, gameId)
      }, await buildYourTurnNotification(gameData, turnUser.id, userListToUserIdNameMap(userList)), {
        channel: 'yourTurn'
      });
    } catch (error) {
      console.error(`Post-response turn-notification work failed for game ${gameData.gameId}`, error);
    }
  });

  return NextResponse.json({success: true});
}
