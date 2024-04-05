import TimedToken from '@/utils/firebase/TimedToken';
import { auth, clerkClient, currentUser } from '@clerk/nextjs';
import { credential } from 'firebase-admin';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from "../../../../utils/mongodb/mongodb";
import { randomUUID } from 'crypto';
import { InvitationData, InvitationRequest } from '@/utils/mongodb/InvitationData';

export interface DiceCitiesInvitationRequest extends InvitationRequest {
  enabledDocks: boolean,
  enabledBillionaireRow: boolean,
}

export interface DiceCitiesInvitationData extends InvitationData {
  enabledDocks: boolean,
  enabledBillionaireRow: boolean,
}

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const diceCitiesInvitation: DiceCitiesInvitationRequest = await request.json();

  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  const thisUser = await currentUser();

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

  // Create invite
  const invite: DiceCitiesInvitationData = {
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: userList.map(user => {
      return {userId: user.id, inviteAccepted: false}
    }),
    enabledDocks: diceCitiesInvitation.enabledDocks,
    enabledBillionaireRow: diceCitiesInvitation.enabledBillionaireRow,
    turnTimer: diceCitiesInvitation.turnTimer,
    timestamp: (new Date()).toISOString()
  }
  const dbClient = await clientPromise;
  const db = dbClient.db("async-games");
  const inviteResponse = await db.collection("gameInvites").insertOne(invite);

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
            }
        }
    }));
  }

  return NextResponse.json({success: true});
}
