import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { TrainTimeInvitationModel, TrainTimeInvitationRequest } from '@/games/TrainTime/TrainTimeModels';
import { MAX_PLAYERS, MIN_PLAYERS } from '@/games/TrainTime/board';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<TrainTimeInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { userId, host, invitees, turnTimer } = setup;

  // Train Time is 2-5 players (docs/games/train-time.md §1); the sender is
  // always a player, so the party size is invitees + 1.
  const playerCount = invitees.length + 1;
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    return NextResponse.json({}, { status: 400, statusText: `Train Time supports ${MIN_PLAYERS}-${MAX_PLAYERS} players` });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new TrainTimeInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'TrainTime',
    gameFriendlyName: 'Train Time'
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({ success: true });
}
