import TimedToken from '@/utils/firebase/TimedToken';
import clientPromise from '@/utils/mongodb/mongodb';
import { auth, clerkClient } from '@clerk/nextjs';
import { credential } from 'firebase-admin';
import { initializeApp, getApp, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import { InvitationData } from '@/utils/mongodb/InvitationData';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const authResponse = auth();
  if (!authResponse.userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  
  const { inviteId } = await request.json();

  const dbClient = await clientPromise;
  const db = dbClient.db("async-games");

  // @ts-ignore
  const inviteData: InvitationData = await db.collection("gameInvites").findOne({inviteId});

  const acceptance = inviteData.userIdList.find((uil) => uil.userId === authResponse.userId);
  if (acceptance) {
    acceptance.inviteAccepted = true;
  }

  if (!inviteData.userIdList.every((uil) => uil.inviteAccepted === true)) {
    await db.collection("gameInvites").replaceOne({"inviteId": inviteId}, inviteData);
    return NextResponse.json({success: true});
  }

  const userList = await clerkClient.users.getUserList({
    userId: inviteData.userIdList.map(uid => uid.userId)
  });

  // Create game
  const gameData = {
    gameId: randomUUID(),
    userIdList: userList.map(user => user.id).concat(inviteData.senderId),
    turnTimer: inviteData.turnTimer,
    currentTurn: authResponse.userId
  }
  await db.collection("gameData").insertOne(gameData);

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
            data: {
                event: 'GameStart',
                inviteId: inviteId,
                gameId: gameData.gameId
            }
        }
    }));
  }

  await db.collection("gameInvites").deleteOne({"inviteId": inviteId});
  return NextResponse.json({success: true});
}
