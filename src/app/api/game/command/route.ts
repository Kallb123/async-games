import TimedToken from '@/utils/firebase/TimedToken';
import { auth, clerkClient, currentUser } from '@clerk/nextjs';
import { credential } from 'firebase-admin';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { DiceCitiesRequestRadioTowerReroll, ICommandOutcome, IGameCommand, IGameType } from '@/utils/apiModels/GameLogic';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { DiceCitiesGameType, DiceCitiesRequestBusinessCenterOpponentSelection, DiceCitiesRequestBusinessCenterOwnSelection, DiceCitiesRequestCardPurchase, DiceCitiesRequestDiceRoll, DiceCitiesRequestPassTurn, DiceCitiesRequestTvStationSelection, DiceCitiesRequestUnlockAmusementPark, DiceCitiesRequestUnlockRadioTower, DiceCitiesRequestUnlockShoppingMall, DiceCitiesRequestUnlockTrainStation } from '@/utils/apiModels/GameLogic';
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
    new DiceCitiesGameType()
  ];
  // console.log(commandRequest);
  console.log(commandRequest.myString());

  const { userId } = auth();
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
  gameType.CheckEndTurn(gameData, commandOutcome);

  await gameData.save();

  const response: ICommandResponse = {
    outcome: commandOutcome,
    gameData: await gameData.CreateDataResponse()
  }

  if (!commandOutcome.turnOver) {
    return NextResponse.json(response, {status: 200});
  }

  const userList = await clerkClient.users.getUserList({
    userId: gameData.userIdList
  });
  const turnUser = userList.find(u => u.id === gameData.currentTurn);

  if (!turnUser) {
    return NextResponse.json({}, {status: 400, statusText: "Next user not found"});
  }

  // initialise Firebase
  if (!getApps().length) {
    initializeApp({
      credential: credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      })
    }, 'adminApp');
  }
  const firebaseApp = getApp('adminApp');
  const messaging = getMessaging(firebaseApp);

  const tokens = userList.flatMap((user) => user.privateMetadata.notificationTokens as TimedToken[]).filter(token => token);
  if (tokens.length) {
    messaging.sendEach(tokens.map((token) => {
        return {
            token: token.token,
            data: {
                event: 'TurnTaken',
                gameId: commandRequest.gameId
            }
        }
    }));
  }

  const turnTokens = (turnUser.privateMetadata.notificationTokens as TimedToken[]).filter(token => token);
  if (turnTokens.length) {
    messaging.sendEach(turnTokens.map((token) => {
        return {
            token: token.token,
            data: {
                event: 'YourTurn',
                gameId: commandRequest.gameId
            },
            notification: {
                title: "Your Turn",
                body: `It's your turn to play!`
            },
        }
    }));
  }

  return NextResponse.json(response, {status: 200});
}
