import { sendPushToUsers, homeNotificationLink } from '@/utils/firebase/pushNotification';
import { buildGameInviteNotification } from '@/utils/firebase/notificationContent';
import { readableName } from '@/utils/ui/players';
import { canHostGame } from '@/utils/users/clerk';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { TrainTimeInvitationModel, TrainTimeInvitationRequest } from '@/games/TrainTime/TrainTimeModels';
import { MAX_PLAYERS, MIN_PLAYERS } from '@/games/TrainTime/board';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const trainTimeInvitation: TrainTimeInvitationRequest = await request.json();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }
  // Every lobby needs a real, registered host — see canHostGame's own
  // comment (docs/account-less-play.md §8).
  if (!canHostGame(thisUser)) {
    return NextResponse.json({}, { status: 403, statusText: "Account not unlocked" });
  }

  const { data: userList } = await (await clerkClient()).users.getUserList({
    username: trainTimeInvitation.userList
  });

  if (userList.length !== trainTimeInvitation.userList.length) {
    return NextResponse.json({}, { status: 404, statusText: "User not found" });
  }

  // Train Time is 2-5 players (docs/games/train-time.md §1); the sender is
  // always a player, so the party size is invitees + 1.
  const playerCount = userList.length + 1;
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    return NextResponse.json({}, { status: 400, statusText: `Train Time supports ${MIN_PLAYERS}-${MAX_PLAYERS} players` });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new TrainTimeInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: userList.map(user => {
      return { userId: user.id, inviteAccepted: false };
    }),
    turnTimer: trainTimeInvitation.turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'TrainTime',
    gameFriendlyName: 'Train Time'
  });

  await invite.save();

  await sendPushToUsers(userList, {
    event: "NewInvite",
    inviteId: invite.inviteId,
    link: homeNotificationLink()
  }, buildGameInviteNotification(readableName(thisUser), invite.gameFriendlyName), {
    channel: 'gameInvite'
  });
  await sendPushToUsers([thisUser], {
    event: "NewInvite",
    inviteId: invite.inviteId,
  });

  return NextResponse.json({ success: true });
}
