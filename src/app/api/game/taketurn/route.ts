import TimedToken from '@/utils/firebase/TimedToken';
import clientPromise from '@/utils/mongodb/mongodb';
import { auth, clerkClient } from '@clerk/nextjs';
import { credential } from 'firebase-admin';
import { initializeApp, getApp, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';
import { GameData } from '@/utils/mongodb/GameData';

export async function POST(request: NextRequest) {
  console.log(`${request.method} ${request.nextUrl.pathname}`);

  const authResponse = auth();
  if (!authResponse.userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  
  const { gameId } = await request.json();

  const dbClient = await clientPromise;
  const db = dbClient.db("async-games");

  // @ts-ignore
  const gameData: GameData = await db.collection("gameData").findOne({gameId});

  if (gameData.currentTurn !== authResponse.userId) {
    return NextResponse.json({}, {status: 401, statusText: "Not your turn"});
  }

  const currentIndex = gameData.gameState.turnOrder.findIndex(to => to === gameData.currentTurn);
  const nextTurn = gameData.gameState.turnOrder[(currentIndex+1)%gameData.gameState.turnOrder.length];
  gameData.currentTurn = nextTurn;

  const userList = await clerkClient.users.getUserList({
    userId: gameData.userIdList
  });
  const turnUser = userList.find(u => u.id === gameData.currentTurn);

  if (!turnUser) {
    return NextResponse.json({}, {status: 400, statusText: "Next user not found"});
  }

  await db.collection("gameData").replaceOne({gameId}, gameData);

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
                gameId
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
                gameId
            },
            notification: {
                title: "Your Turn",
                body: `It's your turn to play!`
            },
        }
    }));
  }

  return NextResponse.json({success: true});
}
