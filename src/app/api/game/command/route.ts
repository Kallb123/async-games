import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildGameLostNotification, buildGameWonNotification, buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { userListToUserIdNameMap } from '@/utils/users/clerk';
import { readableName } from '@/utils/ui/players';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { after, NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { DiceCitiesRequestRadioTowerReroll, ICommandOutcome, IGameCommand, IGameType, SmartthinkGameType, SmartthinkSetSecretCode, SmartthinkSubmitGuess, SnakesAndLaddersGameType, SnakesAndLaddersRequestDiceRoll } from '@/utils/apiModels/GameLogic';
import { GameDataModel, IGameDataDocument, trySave } from '@/utils/mongodb/GameData';
import { recordGameResult } from '@/utils/mongodb/GameResultData';
import { DiceCitiesGameType, DiceCitiesRequestBusinessCenterOpponentSelection, DiceCitiesRequestBusinessCenterOwnSelection, DiceCitiesRequestCardPurchase, DiceCitiesRequestDiceRoll, DiceCitiesRequestPassTurn, DiceCitiesRequestTvStationSelection, DiceCitiesRequestUnlockAmusementPark, DiceCitiesRequestUnlockRadioTower, DiceCitiesRequestUnlockShoppingMall, DiceCitiesRequestUnlockTrainStation } from '@/utils/apiModels/GameLogic';
import { SettlementsAndCitiesGameType, SACPlaceSettlementSetup, SACPlaceRoadSetup, SACPlayKnight, SACRollDice, SACMoveRobber, SACBuildRoad, SACBuildSettlement, SACBuildCity, SACBuyDevCard, SACPlayRoadBuilding, SACPlayYearOfPlenty, SACPlayMonopoly, SACMaritimeTrade, SACEndTurn } from '@/utils/apiModels/GameLogic';
import { WorldDominationGameType, WorldDominationDeployArmies, WorldDominationCashInCards, WorldDominationAttack, WorldDominationOccupyTerritory, WorldDominationEndAttackPhase, WorldDominationFortify, WorldDominationSkipFortify } from '@/utils/apiModels/GameLogic';
import { SolitaireGameType, SolitaireDraw, SolitaireMoveCard, SolitaireUndo, SolitaireAutoSolve } from '@/utils/apiModels/GameLogic';
import { deserializeJSON } from '@/utils/apiModels/Serialisable';
import { IGameDataResponse } from '@/utils/apiModels/GameDataApi';

export interface ICommandResponse {
  outcome: ICommandOutcome,
  gameData: IGameDataResponse
}

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const commandRequest: IGameCommand = deserializeJSON(await request.text());
  var registration = [
    new DiceCitiesRequestDiceRoll(),
    new DiceCitiesRequestCardPurchase(),
    new DiceCitiesRequestPassTurn(),
    new DiceCitiesRequestUnlockTrainStation(),
    new DiceCitiesRequestUnlockShoppingMall(),
    new DiceCitiesRequestUnlockAmusementPark(),
    new DiceCitiesRequestUnlockRadioTower(),
    new DiceCitiesRequestTvStationSelection(),
    new DiceCitiesRequestBusinessCenterOwnSelection(),
    new DiceCitiesRequestBusinessCenterOpponentSelection(),
    new DiceCitiesRequestRadioTowerReroll(),
    new DiceCitiesGameType(),
    new SmartthinkSetSecretCode(),
    new SmartthinkSubmitGuess(),
    new SmartthinkGameType(),
    new SnakesAndLaddersRequestDiceRoll(),
    new SnakesAndLaddersGameType(),
    new SACPlaceSettlementSetup(),
    new SACPlaceRoadSetup(),
    new SACPlayKnight(),
    new SACRollDice(),
    new SACMoveRobber(),
    new SACBuildRoad(),
    new SACBuildSettlement(),
    new SACBuildCity(),
    new SACBuyDevCard(),
    new SACPlayRoadBuilding(),
    new SACPlayYearOfPlenty(),
    new SACPlayMonopoly(),
    new SACMaritimeTrade(),
    new SACEndTurn(),
    new SettlementsAndCitiesGameType(),
    new WorldDominationDeployArmies(),
    new WorldDominationCashInCards(),
    new WorldDominationAttack(),
    new WorldDominationOccupyTerritory(),
    new WorldDominationEndAttackPhase(),
    new WorldDominationFortify(),
    new WorldDominationSkipFortify(),
    new WorldDominationGameType(),
    new SolitaireDraw(),
    new SolitaireMoveCard(),
    new SolitaireUndo(),
    new SolitaireAutoSolve(),
    new SolitaireGameType(),
  ];
  // console.log(commandRequest);
  console.log(commandRequest.myString());

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  await dbConnect();
  const gameData: IGameDataDocument = await GameDataModel.findOne({gameId: commandRequest.gameId}).exec();
//   console.log(gameData);

  if (userId !== gameData.currentTurn) {
    return NextResponse.json({}, {status: 400, statusText: "Not your turn in this game"});
  }

  if (userId !== commandRequest.senderId) {
    return NextResponse.json({}, {status: 400, statusText: "Can't request for someone else"});
  }

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
      gameData: await gameData.CreateDataResponse()
    }

    // Recording the match result and telling everyone the game is over doesn't
    // change what this player sees, so it runs after the response has flushed
    // rather than making them wait on a Clerk lookup and a fan-out of pushes.
    // recordGameResult is idempotent on gameId, so a retried request is a no-op.
    after(async () => {
      try {
        await recordGameResult(gameData);

        const { data: userList } = await (await clerkClient()).users.getUserList({
          userId: gameData.userIdList
        });

        const winnerUser = userList.find(u => u.id === gameData.winner);
        const losers = userList.filter(u => u.id !== gameData.winner);

        if (winnerUser) {
          await sendPushToUsers([winnerUser], {
            event: 'GameOver',
            gameId: commandRequest.gameId,
            link: gameNotificationLink(gameData.gameType.url, commandRequest.gameId)
          }, buildGameWonNotification(gameData, losers.map(u => readableName(u))), {
            channel: 'yourTurn'
          });
        }

        await sendPushToUsers(losers, {
          event: 'GameOver',
          gameId: commandRequest.gameId,
          link: gameNotificationLink(gameData.gameType.url, commandRequest.gameId)
        }, buildGameLostNotification(gameData, winnerUser ? readableName(winnerUser) : ''));
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
    gameData: await gameData.CreateDataResponse()
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
