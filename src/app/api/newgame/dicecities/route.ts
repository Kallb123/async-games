import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { DiceCitiesInvitationModel, DiceCitiesInvitationRequest } from '@/games/DiceCities/DiceCitiesModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<DiceCitiesInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { body, userId, host, invitees, turnTimer } = setup;

  if (invitees.length === 0) {
    return NextResponse.json({}, {status: 404, statusText: "User not found"});
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new DiceCitiesInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    enabledDocks: body.enabledDocks,
    enabledBillionaireRow: body.enabledBillionaireRow,
    turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'DiceCities',
    gameFriendlyName: 'Dice Cities'
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({success: true});
}
