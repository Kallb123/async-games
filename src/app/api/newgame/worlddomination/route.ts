import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { WorldDominationInvitationModel, WorldDominationInvitationRequest } from '@/games/WorldDomination/WorldDominationModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

const MAX_PLAYERS = 6;

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<WorldDominationInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { userId, host, invitees, turnTimer } = setup;

  if (invitees.length === 0) {
    return NextResponse.json({}, { status: 404, statusText: "User not found" });
  }

  // World Domination supports 2-6 players (docs/games/worlddomination.md §1);
  // the sender is always a player, so the party size is invitees + 1.
  if (invitees.length + 1 > MAX_PLAYERS) {
    return NextResponse.json({}, { status: 400, statusText: `World Domination supports at most ${MAX_PLAYERS} players` });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new WorldDominationInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'WorldDomination',
    gameFriendlyName: 'World Domination'
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({ success: true });
}
