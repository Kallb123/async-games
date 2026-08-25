import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { SmartthinkInvitationModel, SmartthinkInvitationRequest } from '@/games/Smartthink/SmartthinkModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<SmartthinkInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { userId, host, invitees, turnTimer } = setup;

  if (invitees.length !== 1) {
    return NextResponse.json({}, {status: 400, statusText: "Smartthink requires exactly one opponent"});
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new SmartthinkInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'Smartthink',
    gameFriendlyName: 'Smartthink'
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({ success: true });
}
