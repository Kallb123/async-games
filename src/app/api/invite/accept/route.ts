import TimedToken from '@/utils/firebase/TimedToken';
import { getAdminMessaging } from '@/utils/firebase/adminFirebase';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { DiceCitiesGameDataModel } from '@/games/DiceCities/DiceCitiesModels';
import { SnakesAndLaddersGameDataModel } from '@/games/SnakesAndLadders/SnakesAndLaddersModels';
import { SettlementsAndCitiesGameDataModel } from '@/games/SettlementsAndCities/SettlementsAndCitiesModels';
import { SmartthinkGameDataModel } from '@/games/Smartthink/SmartthinkModels';
import { uuidString } from '@/utils/apiModels/GameDataApi';
import { IGameDataDocument } from '@/utils/mongodb/GameData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const authResponse = await auth();
  if (!authResponse.userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  
  const { inviteId } = await request.json();

  await dbConnect();
  const inviteData: IInvitationDataDocument = await InvitationModel.findOne({inviteId}).exec();
  if (!inviteData) {
    return NextResponse.json({}, {status: 404, statusText: "Invite not found"});
  }

  const acceptance = inviteData.userIdList.find((uil) => uil.userId === authResponse.userId);
  if (acceptance) {
    acceptance.inviteAccepted = true;
  }

  // initialise Firebase
  const messaging = getAdminMessaging();

  const userIdList = inviteData.userIdList.map(uid => uid.userId);
  const { data: userList } = await (await clerkClient()).users.getUserList({
    userId: userIdList
  });

  // If not everyone has accepted
  const allAccepted = inviteData.userIdList.every((uil) => uil.inviteAccepted === true);
  if (!allAccepted) {
    await inviteData.save();
  }

  const tokens = userList.flatMap((user) => user.privateMetadata.notificationTokens as TimedToken[]).filter(token => token);
  if (tokens.length) {
    messaging.sendEach(tokens.map((token) => {
        return {
            token: token.token,
            data: {
                event: 'InviteAccepted',
                inviteId: inviteId
            }
        }
    }));
  }

  if (!allAccepted) {
    return NextResponse.json({success: true, gameStarted: false});
  }

  // Create game
  const gameData = await inviteData.CreateGame(inviteData, userIdList.concat(inviteData.senderId));
  let gameDataM: IGameDataDocument;
  if (inviteData.gameType === 'SnakesAndLadders') {
    gameDataM = new SnakesAndLaddersGameDataModel(gameData);
  } else if (inviteData.gameType === 'SettlementsAndCities') {
    gameDataM = new SettlementsAndCitiesGameDataModel(gameData);
  } else if (inviteData.gameType === 'DiceCities') {
    gameDataM = new DiceCitiesGameDataModel(gameData);
  } else if (inviteData.gameType === 'Smartthink') {
    gameDataM = new SmartthinkGameDataModel(gameData);
  } else {
    throw new Error(`Unsupported game type: ${inviteData.gameType}`);
  }

  await gameDataM.save();
  
  await inviteData.deleteOne();

  if (tokens.length) {
    messaging.sendEach(tokens.map((token) => {
        return {
            token: token.token,
            data: {
                event: 'GameStart',
                inviteId: inviteId,
                gameId: gameData.gameId.toString() as uuidString
            }
        }
    }));
  }

  return NextResponse.json({success: true, gameStarted: true, gameId: gameData.gameId, gameUrl: gameData.gameType.url});
}
