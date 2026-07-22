import { sendPushToUsers } from '@/utils/firebase/pushNotification';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { DiceCitiesRequestRadioTowerReroll, ICommandOutcome, IGameCommand, IGameType, SmartthinkGameType, SmartthinkSetSecretCode, SmartthinkSubmitGuess, SnakesAndLaddersGameType, SnakesAndLaddersRequestDiceRoll } from '@/utils/apiModels/GameLogic';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { DiceCitiesGameType, DiceCitiesRequestBusinessCenterOpponentSelection, DiceCitiesRequestBusinessCenterOwnSelection, DiceCitiesRequestCardPurchase, DiceCitiesRequestDiceRoll, DiceCitiesRequestPassTurn, DiceCitiesRequestTvStationSelection, DiceCitiesRequestUnlockAmusementPark, DiceCitiesRequestUnlockRadioTower, DiceCitiesRequestUnlockShoppingMall, DiceCitiesRequestUnlockTrainStation } from '@/utils/apiModels/GameLogic';
import { SettlementsAndCitiesGameType, SACPlaceSettlementSetup, SACPlaceRoadSetup, SACPlayKnight, SACRollDice, SACMoveRobber, SACBuildRoad, SACBuildSettlement, SACBuildCity, SACBuyDevCard, SACPlayRoadBuilding, SACPlayYearOfPlenty, SACPlayMonopoly, SACMaritimeTrade, SACEndTurn } from '@/utils/apiModels/GameLogic';
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
  ];
  // console.log(commandRequest);
  console.log(commandRequest.myString());

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  const thisUser = await currentUser();
  if (!thisUser) {
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

  gameData.gameState.commandHistory.push(commandRequest);
  gameData.markModified('gameState.commandHistory');

  // Checks whether the turn should be progressed and actions it if so
  const gameType: IGameType = deserializeJSON(JSON.stringify(gameData.gameType));
  if (gameType.CheckGameOver(gameData)) {
    await gameData.save();

    const response: ICommandResponse = {
      outcome: commandOutcome,
      gameData: await gameData.CreateDataResponse()
    }

    const { data: userList } = await (await clerkClient()).users.getUserList({
      userId: gameData.userIdList
    });

    const winnerUser = userList.find(u => u.id === gameData.winner);
    const winnerUsername = winnerUser?.username ?? winnerUser?.firstName ?? gameData.winner;
    const gameIconUrl = `https://async-games.vercel.app/art/dicecities/icon.png`;

    if (winnerUser) {
      await sendPushToUsers([winnerUser], {
        event: 'GameOver',
        gameId: commandRequest.gameId
      }, {
        title: "You won! 🎉",
        body: `Congratulations, you won the game!`,
        imageUrl: gameIconUrl
      }, {
        channel: 'yourTurn'
      });
    }

    const losers = userList.filter(u => u.id !== gameData.winner);
    await sendPushToUsers(losers, {
      event: 'GameOver',
      gameId: commandRequest.gameId
    }, {
      title: "Game Over",
      body: `${winnerUsername} won the game. Better luck next time!`,
      imageUrl: gameIconUrl
    });

    return NextResponse.json(response, {status: 200});
  }
  
  gameType.CheckEndTurn(gameData, commandOutcome);

  if (commandOutcome.turnOver) {
    gameData.lastTurnTimestamp = new Date().toISOString();
    gameData.timerWarningNotificationSent = false;
  }

  await gameData.save();

  const response: ICommandResponse = {
    outcome: commandOutcome,
    gameData: await gameData.CreateDataResponse()
  }

  if (!commandOutcome.turnOver) {
    return NextResponse.json(response, {status: 200});
  }

  const { data: userList } = await (await clerkClient()).users.getUserList({
    userId: gameData.userIdList
  });
  const turnUser = userList.find(u => u.id === gameData.currentTurn);

  if (!turnUser) {
    return NextResponse.json({}, {status: 400, statusText: "Next user not found"});
  }

  await sendPushToUsers(userList, {
    event: 'TurnTaken',
    gameId: commandRequest.gameId
  });

  await sendPushToUsers([turnUser], {
    event: 'YourTurn',
    gameId: commandRequest.gameId
  }, {
    title: "Your Turn",
    body: `It's your turn to play!`,
    imageUrl: `https://async-games.vercel.app/art/dicecities/icon.png`
  }, {
    channel: 'yourTurn'
  });

  return NextResponse.json(response, {status: 200});
}
