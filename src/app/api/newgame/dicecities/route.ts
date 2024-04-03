import TimedToken from '@/utils/firebase/TimedToken';
import { auth, clerkClient, currentUser } from '@clerk/nextjs';
import { credential } from 'firebase-admin';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';

export interface DiceCitiesInvitation {
  userList: string[],
  enabledDocks: boolean,
  enabledBillionaireRow: boolean,
  turnTimer: string
}

export async function POST(request: NextRequest) {
  const diceCitiesInvitation: DiceCitiesInvitation = await request.json();
  console.log(diceCitiesInvitation);

  const { userId } = auth();
  if (!userId) {
    return NextResponse.error();
  }
  const thisUser = await currentUser();

  const userList = await clerkClient.users.getUserList({
    username: diceCitiesInvitation.userList
  });

  console.log(userList);
  // Lookup failed for a user
  if (userList.length !== diceCitiesInvitation.userList.length) {
    return NextResponse.error();
  }

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
  const tokens = userList.flatMap((user) => user.privateMetadata.notificationTokens as TimedToken[]);
  messaging.sendEach(tokens.map((token) => {
      return {
          token: token.token,
          notification: {
              title: "Game Invite",
              body: `${thisUser?.username} has invited you to play Dice Cities!`
          }
      }
  }));

  return NextResponse.json({success: true});
}
