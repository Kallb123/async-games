import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { SnakesAndLaddersInvitationModel, SnakesAndLaddersInvitationRequest } from '@/games/SnakesAndLadders/SnakesAndLaddersModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<SnakesAndLaddersInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { body, userId, host, invitees, turnTimer } = setup;

  if (invitees.length === 0) {
    return NextResponse.json({}, { status: 404, statusText: "User not found" });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new SnakesAndLaddersInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'SnakesAndLadders',
    gameFriendlyName: 'Snakes and Ladders',
    reRollOnSix: body.reRollOnSix === true
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({ success: true });
}
