import TimedToken from '@/utils/firebase/TimedToken';
import { auth, clerkClient, currentUser } from '@clerk/nextjs';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { token } = await request.json();
  if (!token) {
    return NextResponse.error();
  }

  const { userId } = auth();
  if (!userId) {
    return NextResponse.error();
  }

  const user = await currentUser();

  const newToken: TimedToken = {
    token,
    timestamp: (new Date()).toISOString()
  };

  let privateMetadata = user?.privateMetadata;
  if (privateMetadata) {
    if (privateMetadata.notificationTokens) {
      const foundToken = (privateMetadata.notificationTokens as Array<TimedToken>).find((val) => val.token === newToken.token);
      if (foundToken) {
        foundToken.timestamp = (new Date()).toISOString();
      } else {
        (privateMetadata.notificationTokens as Array<TimedToken>).push(newToken);
      }
    } else {
      privateMetadata.notificationTokens = [newToken];
    }
  } else {
    privateMetadata = {
      notificationTokens: [newToken]
    }
  }

  await clerkClient.users.updateUserMetadata(userId, {
    privateMetadata: privateMetadata
  });

  return NextResponse.json({success: true});
}
