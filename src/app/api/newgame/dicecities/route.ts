import TimedToken from '@/utils/firebase/TimedToken';
import { auth, clerkClient, currentUser } from '@clerk/nextjs';
import { credential } from 'firebase-admin';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { IInvitationData, IInvitationDataDocument, InvitationModel, InvitationRequest } from '@/utils/mongodb/InvitationData';
import { Model, Schema, models } from 'mongoose';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { IDiceCitiesGameData } from '@/utils/mongodb/GameData';

export interface DiceCitiesInvitationRequest extends InvitationRequest {
  enabledDocks: boolean,
  enabledBillionaireRow: boolean,
}

export interface IDiceCitiesInvitationData extends IInvitationData {
  enabledDocks: boolean,
  enabledBillionaireRow: boolean,
}

export interface IDiceCitiesInvitationDataDocument extends IDiceCitiesInvitationData, IInvitationDataDocument {

}

export interface IDiceCitiesInvitationDataModel extends Model<IDiceCitiesInvitationDataDocument> {
  // Model methods
}

var DiceCitiesInvitationSchema = new Schema<IDiceCitiesInvitationDataDocument>({
  enabledDocks: Boolean,
  enabledBillionaireRow: Boolean
}, {discriminatorKey: 'kind'});
DiceCitiesInvitationSchema.methods.CreateGame = function(invite: IDiceCitiesInvitationData, userIdList: string[]) {
  console.log("Creating dice cities game!!");

  const turnOrder = userIdList;
  const gameData: IDiceCitiesGameData = {
      gameId: randomUUID(),
      gameType: invite.gameType,
      userIdList,
      turnTimer: invite.turnTimer,
      currentTurn: turnOrder[0],
      lastTurnTimestamp: (new Date()).toISOString(),
      gameState: {
          turnOrder,
          history: []
      },
      specificGameState: {
        bankCards: []
      },
      enabledDocks: invite.enabledDocks,
      enabledBillionaireRow: invite.enabledBillionaireRow
  }
  return gameData;
};
var DiceCitiesInvitationModel = models.DiceCitiesInvitation || InvitationModel.discriminator<IDiceCitiesInvitationDataDocument, IDiceCitiesInvitationDataModel>('DiceCitiesInvitation', DiceCitiesInvitationSchema);

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const diceCitiesInvitation: DiceCitiesInvitationRequest = await request.json();

  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const userList = await clerkClient.users.getUserList({
    username: diceCitiesInvitation.userList
  });

  // Lookup failed for a user
  if (userList.length !== diceCitiesInvitation.userList.length) {
    return NextResponse.json({}, {status: 404, statusText: "User not found"});
  }

  if (userList.length === 0) {
    return NextResponse.json({}, {status: 404, statusText: "User not found"});
  }

  await dbConnect();

  // Create invite
  const invite = new DiceCitiesInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: userList.map(user => {
      return {userId: user.id, inviteAccepted: false}
    }),
    enabledDocks: diceCitiesInvitation.enabledDocks,
    enabledBillionaireRow: diceCitiesInvitation.enabledBillionaireRow,
    turnTimer: diceCitiesInvitation.turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'DiceCities'
  });

  await invite.save();

  // Send notifications
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
            notification: {
                title: "Game Invite",
                body: `${thisUser?.username} has invited you to play Dice Cities!`
            },
            data: {
              event: "NewInvite",
              inviteId: invite.inviteId,
            }
        }
    }));
  }
  const tokensSender = (thisUser.privateMetadata.notificationTokens as TimedToken[]).filter(token => token);
  if (tokensSender.length) {
    messaging.sendEach(tokensSender.map((token) => {
        return {
            token: token.token,
            data: {
              event: "NewInvite",
              inviteId: invite.inviteId,
            }
        }
    }));
  }

  return NextResponse.json({success: true});
}
