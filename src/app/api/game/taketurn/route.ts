import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { auth } from '@clerk/nextjs/server';
import { after, NextRequest, NextResponse } from 'next/server';
import { trySave } from '@/utils/mongodb/GameData';
import { userListToUserIdNameMap, usersById } from '@/utils/users/clerk';
import { requireLiveGame } from '@/utils/games/liveGame';
import { readJsonBody } from '@/utils/api/requestBody';
import { getTurnTimeoutAdapter } from '@/utils/games/turnTimeout';

export async function POST(request: NextRequest) {
  console.log(`${request.method} ${request.nextUrl.pathname}`);

  const authResponse = await auth();
  if (!authResponse.userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  
  const { gameId } = await readJsonBody(request);

  await dbConnect();
  const found = await requireLiveGame(gameId);
  if ('error' in found) {
    return found.error;
  }
  const gameData = found.game;

  if (gameData.currentTurn !== authResponse.userId) {
    return NextResponse.json({}, {status: 401, statusText: "Not your turn"});
  }

  // This route hands the turn to whoever is next along `gameState.turnOrder`
  // — the join order — with no idea what game it's advancing. That's only
  // correct for a game whose own `CheckEndTurn` does the same plain walk. A
  // game that registers a turn-timeout adapter (turnTimeout.ts) is, by that
  // same fact, a game whose real turn order lives somewhere else — Race
  // Cars' `roundOrder`/`roundIndex` (docs/games/race-cars.md §23.2), Fires
  // Out's `activeFirefighter` — and calling this route on it desyncs
  // `currentTurn` from that without touching it. Every other driver is then
  // refused by the command route, and whichever bystander `turnOrder`
  // happened to land on inherits a stalled turn it can never legitimately
  // take: the turn-timeout cron's adapter refuses the same command Execute
  // does (`userId === roundOrder[roundIndex]`), so it comes back `declined`
  // forever, banking a missed turn against that innocent player every sweep
  // until the abandon ladder ends the race for everyone. Refusing here,
  // before any of that, is cheaper than teaching this route every game's
  // own notion of "next".
  if (getTurnTimeoutAdapter(gameData.gameType.className)) {
    return NextResponse.json({}, {status: 400, statusText: "This game manages its own turn order; use /api/game/command instead"});
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
      const userList = await usersById(gameData.userIdList);
      const turnUser = userList.find(u => u.id === gameData.currentTurn);

      if (!turnUser) {
        console.error(`Next user not found for game ${gameData.gameId}`);
        return;
      }

      await sendPushToUsers([turnUser], {
        event: 'YourTurn',
        gameId: gameData.gameId,
        link: gameNotificationLink(gameData.gameType.url, gameData.gameId)
      }, await buildYourTurnNotification(gameData, turnUser.id, userListToUserIdNameMap(userList)), {
        channel: 'yourTurn'
      });
    } catch (error) {
      console.error(`Post-response turn-notification work failed for game ${gameData.gameId}`, error);
    }
  });

  return NextResponse.json({success: true});
}
