import TimedToken from '@/utils/firebase/TimedToken';
import { getAdminMessaging } from '@/utils/firebase/adminFirebase';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { SmartthinkInvitationModel, SmartthinkInvitationRequest } from '@/games/Smartthink/SmartthinkModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const smartthinkInvitation: SmartthinkInvitationRequest = await request.json();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const { data: userList } = await (await clerkClient()).users.getUserList({
    username: smartthinkInvitation.userList
  });

  if (userList.length !== smartthinkInvitation.userList.length) {
    return NextResponse.json({}, {status: 404, statusText: "User not found"});
  }

  if (userList.length !== 1) {
    return NextResponse.json({}, {status: 400, statusText: "Smartthink requires exactly one opponent"});
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new SmartthinkInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: userList.map(user => {
      return { userId: user.id, inviteAccepted: false };
    }),
    turnTimer: smartthinkInvitation.turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'Smartthink',
    gameFriendlyName: 'Smartthink'
  });

  await invite.save();

  const messaging = getAdminMessaging();
  const tokens = userList.flatMap((user) => user.privateMetadata.notificationTokens as TimedToken[]).filter(token => token);
  if (tokens.length) {
    messaging.sendEach(tokens.map((token) => {
      return {
        token: token.token,
        notification: {
          title: "Game Invite",
          body: `${thisUser?.username} has invited you to play Smartthink!`,
          imageUrl: `https://async-games.vercel.app/art/smartthink/icon.png`
        },
        data: {
          event: "NewInvite",
          inviteId: invite.inviteId,
        },
        apns: {
          fcmOptions: {
            imageUrl: `https://async-games.vercel.app/art/smartthink/icon.png`
          }
        },
        android: {
          notification: {
            imageUrl: `https://async-games.vercel.app/art/smartthink/icon.png`
          }
        },
        webpush: {
          headers: {
            "image": `https://async-games.vercel.app/art/smartthink/icon.png`
          }
        }
      };
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
      };
    }));
  }

  return NextResponse.json({ success: true });
}
