import TimedToken from '@/utils/firebase/TimedToken';
import { auth, clerkClient } from '@clerk/nextjs';
import { credential } from 'firebase-admin';
import { initializeApp, getApp, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const authResponse = auth();

  if (!authResponse.userId) {
    return NextResponse.error();
  }
  
  const { userId } = await request.json();
  const user = await clerkClient.users.getUser(userId);

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
  const tokens = user.privateMetadata.notificationTokens as TimedToken[];
  messaging.sendEach(tokens.map((token) => {
      return {
          token: token.token,
          notification: {
              title: "Test Title",
              body: "Test Body"
          }
      }
  }));

  return NextResponse.json({success: true});
}
