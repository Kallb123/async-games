import TimedToken from '@/utils/firebase/TimedToken';
import { getAdminMessaging } from '@/utils/firebase/adminFirebase';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { Message } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { DiceCitiesRequestRadioTowerReroll, ICommandOutcome, IGameCommand, IGameType, SnakesAndLaddersGameType, SnakesAndLaddersRequestDiceRoll } from '@/utils/apiModels/GameLogic';
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

  // initialise Firebase
  const messaging = getAdminMessaging();

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

    const winnerTokens = (winnerUser?.privateMetadata.notificationTokens as TimedToken[] ?? []).filter(token => token);
    if (winnerTokens.length) {
      messaging.sendEach(winnerTokens.map((token) => {
        const message: Message = {
          token: token.token,
          data: {
            event: 'GameOver',
            gameId: commandRequest.gameId
          },
          notification: {
            title: "You won! 🎉",
            body: `Congratulations, you won the game!`,
            imageUrl: gameIconUrl
          },
          apns: {
            fcmOptions: {
              imageUrl: gameIconUrl
            }
          },
          android: {
            notification: {
              imageUrl: gameIconUrl
            }
          },
          webpush: {
            headers: {
              "image": gameIconUrl
            }
          }
        };
        console.log(`Sending GameOver (won) to ${winnerUsername} via ${token.token}`);
        return message;
      }));
    }

    const loserTokens = userList
      .filter(u => u.id !== gameData.winner)
      .flatMap((user) => user.privateMetadata.notificationTokens as TimedToken[])
      .filter(token => token);
    if (loserTokens.length) {
      messaging.sendEach(loserTokens.map((token) => {
        const message: Message = {
          token: token.token,
          data: {
            event: 'GameOver',
            gameId: commandRequest.gameId
          },
          notification: {
            title: "Game Over",
            body: `${winnerUsername} won the game. Better luck next time!`,
            imageUrl: gameIconUrl
          },
          apns: {
            fcmOptions: {
              imageUrl: gameIconUrl
            }
          },
          android: {
            notification: {
              imageUrl: gameIconUrl
            }
          },
          webpush: {
            headers: {
              "image": gameIconUrl
            }
          }
        };
        console.log(`Sending GameOver (lost) to user via ${token.token}`);
        return message;
      }));
    }

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
      const message: Message = {
            token: token.token,
            data: {
                event: 'YourTurn',
                gameId: commandRequest.gameId
            },
            notification: {
                title: "Your Turn",
                body: `It's your turn to play!`,
                imageUrl: `https://async-games.vercel.app/art/dicecities/icon.png`
            },
            apns: {
              fcmOptions: {
                imageUrl: `https://async-games.vercel.app/art/dicecities/icon.png`
              }
            },
            android: {
              notification: {
                imageUrl: `https://async-games.vercel.app/art/dicecities/icon.png`
              }
            },
            webpush: {
              headers: {
                "image": `https://async-games.vercel.app/art/dicecities/icon.png`
              }
            }
        }
        console.log(`Sending YourTurn to ${turnUser.username} via ${token.token}`);
      return message;
    }));
  }

  return NextResponse.json(response, {status: 200});
}
