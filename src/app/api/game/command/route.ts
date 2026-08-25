import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildGameLostNotification, buildGameWonNotification, buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { userListToUserIdNameMap, usersById } from '@/utils/users/clerk';
import { readableName } from '@/utils/ui/players';
import { auth } from '@clerk/nextjs/server';
import { after, NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { ICommandOutcome, IGameCommand, IGameType, stripRecordedRandomness } from '@/utils/apiModels/GameLogic';
import { trySave } from '@/utils/mongodb/GameData';
import { requireLiveGame } from '@/utils/games/liveGame';
import { isCommandForGameType } from '@/utils/games/gameCommands';
import { recordGameResult } from '@/utils/mongodb/GameResultData';
import { unclaimedGuestsOf } from '@/utils/users/guest';
import { deserializeJSON } from '@/utils/apiModels/Serialisable';
import { IGameDataResponse } from '@/utils/apiModels/GameDataApi';

export interface ICommandResponse {
  outcome: ICommandOutcome,
  gameData: IGameDataResponse
}

/**
 * The command a request body carried, or null if it carried anything else.
 *
 * `deserializeJSON` throws on a body that isn't JSON, and quietly hands back a
 * plain object for JSON whose `className` isn't a registered command — which
 * then throws on the first method call instead. Both are the same 400, so both
 * are answered here rather than becoming a 500 from inside the handler.
 */
function readCommand(body: string): IGameCommand | null {
  let parsed: unknown;
  try {
    parsed = deserializeJSON(body);
  } catch {
    return null;
  }
  const command = parsed as IGameCommand | null;
  if (!command || typeof command.Execute !== 'function' || typeof command.myString !== 'function') {
    return null;
  }
  return command;
}

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  // Authentication first, and every read of the body after it. Deserialising
  // ran ahead of `auth()` before, so a body that wasn't JSON — or was JSON but
  // not a registered command, leaving a plain object with no `myString` —
  // threw before anyone had proved who they were: an unauthenticated 500 on a
  // POST of `{}`.
  const commandRequest: IGameCommand | null = readCommand(await request.text());
  if (!commandRequest) {
    return NextResponse.json({}, {status: 400, statusText: "Not a valid command"});
  }
  console.log(commandRequest.myString());

  await dbConnect();
  const found = await requireLiveGame(commandRequest.gameId);
  if ('error' in found) {
    return found.error;
  }
  const gameData = found.game;

  if (userId !== gameData.currentTurn) {
    return NextResponse.json({}, {status: 400, statusText: "Not your turn in this game"});
  }

  if (userId !== commandRequest.senderId) {
    return NextResponse.json({}, {status: 400, statusText: "Can't request for someone else"});
  }

  // A command only runs against the game that owns it — see gameCommands.ts.
  // Every Execute casts the game to its own shape on the first line, so a
  // command from another game reaches those rules holding state they were
  // never written for.
  if (!isCommandForGameType(gameData.gameType.className, commandRequest.className)) {
    console.warn(`POST ${request.nextUrl.pathname} 400: ${commandRequest.className} is not a ${gameData.gameType.className} command`);
    return NextResponse.json({}, {status: 400, statusText: "Not a command for this game"});
  }

  // The client supplies the move, never the randomness it consumes. Recorded
  // RNG is a replay mechanism, and every Execute prefers a recorded value over
  // rolling fresh, so a request that arrived carrying one would be choosing its
  // own dice. Replay (buildTimeline) still honours them; a live request can't.
  stripRecordedRandomness(commandRequest);

  const commandOutcome = await commandRequest.Execute(gameData);
  if (!commandOutcome.validMove) {
    return NextResponse.json({}, {status: 401, statusText: "Not a valid move"});
  }

  // They acted within their turn window, so they haven't missed this one —
  // clear any run of expiries the turntimer cron had counted against them.
  if (gameData.missedTurnCounts?.get(commandRequest.senderId)) {
    gameData.missedTurnCounts.set(commandRequest.senderId, 0);
  }

  gameData.gameState.commandHistory.push(commandRequest);
  gameData.markModified('gameState.commandHistory');

  // Checks whether the turn should be progressed and actions it if so
  const gameType: IGameType = deserializeJSON(JSON.stringify(gameData.gameType));
  if (gameType.CheckGameOver(gameData)) {
    gameData.endReason = "win";
    if (!(await trySave(gameData))) {
      return NextResponse.json({}, {status: 409, statusText: "Game state changed, please refresh and try again"});
    }

    const response: ICommandResponse = {
      outcome: commandOutcome,
      gameData: await gameData.CreateDataResponse(userId)
    }

    // Recording the match result and telling everyone the game is over doesn't
    // change what this player sees, so it runs after the response has flushed
    // rather than making them wait on a Clerk lookup and a fan-out of pushes.
    // recordGameResult is idempotent on gameId, so a retried request is a no-op.
    after(async () => {
      try {
        const userList = await usersById(gameData.userIdList);

        const { unclaimedPlayerIds, guestNames } = unclaimedGuestsOf(userList);
        await recordGameResult(gameData, unclaimedPlayerIds, guestNames);

        const winnerUser = userList.find(u => u.id === gameData.winner);
        const losers = userList.filter(u => u.id !== gameData.winner);

        if (winnerUser) {
          await sendPushToUsers([winnerUser], {
            event: 'GameOver',
            gameId: commandRequest.gameId,
            link: gameNotificationLink(gameData.gameType.url, commandRequest.gameId)
          }, buildGameWonNotification(gameData, losers.map(u => readableName(u))), {
            channel: 'gameOver'
          });
        }

        await sendPushToUsers(losers, {
          event: 'GameOver',
          gameId: commandRequest.gameId,
          link: gameNotificationLink(gameData.gameType.url, commandRequest.gameId)
        }, buildGameLostNotification(gameData, winnerUser ? readableName(winnerUser) : ''), {
          channel: 'gameOver'
        });
      } catch (error) {
        console.error(`Post-response game-over work failed for game ${gameData.gameId}`, error);
      }
    });

    return NextResponse.json(response, {status: 200});
  }
  
  gameType.CheckEndTurn(gameData, commandOutcome);

  if (commandOutcome.turnOver) {
    gameData.lastTurnTimestamp = new Date().toISOString();
    gameData.timerWarningNotificationSent = false;
  }

  if (!(await trySave(gameData))) {
    return NextResponse.json({}, {status: 409, statusText: "Game state changed, please refresh and try again"});
  }

  const response: ICommandResponse = {
    outcome: commandOutcome,
    gameData: await gameData.CreateDataResponse(userId)
  }

  if (!commandOutcome.turnOver) {
    return NextResponse.json(response, {status: 200});
  }

  // Notifying the next player — the Clerk lookup and building their "your move"
  // body (which replays the whole game through the recap engine) — is the
  // slowest part of a turn and none of it is anything the player who just moved
  // is waiting on. Run it after the response has flushed. A failure here can't
  // cost a move that's already saved, so it's logged and swallowed rather than
  // turned into an error.
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
        gameId: commandRequest.gameId,
        link: gameNotificationLink(gameData.gameType.url, commandRequest.gameId)
      }, await buildYourTurnNotification(gameData, turnUser.id, userListToUserIdNameMap(userList)), {
        channel: 'yourTurn'
      });
    } catch (error) {
      console.error(`Post-response turn-notification work failed for game ${gameData.gameId}`, error);
    }
  });

  return NextResponse.json(response, {status: 200});
}
