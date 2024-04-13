import TimedToken from '@/utils/firebase/TimedToken';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { auth, clerkClient } from '@clerk/nextjs';
import { credential } from 'firebase-admin';
import { initializeApp, getApp, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { DiceCitiesGameDataModel } from '@/games/DiceCities/DiceCitiesModels';
import { uuidString } from '@/utils/apiModels/GameDataApi';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const authResponse = auth();
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

  const userIdList = inviteData.userIdList.map(uid => uid.userId);
  const userList = await clerkClient.users.getUserList({
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
    return NextResponse.json({success: true});
  }

  // Create game
  const gameData = inviteData.CreateGame(inviteData, userIdList.concat(inviteData.senderId));
  const gameDataM = new DiceCitiesGameDataModel(gameData);

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

  return NextResponse.json({success: true});
}
