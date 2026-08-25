import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { SettlementsAndCitiesInvitationModel, SettlementsAndCitiesInvitationRequest } from '@/games/SettlementsAndCities/SettlementsAndCitiesModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';
import { normaliseExpansions, validateExpansions } from '@/games/SettlementsAndCities/expansions';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<SettlementsAndCitiesInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { body, userId, host, invitees, turnTimer } = setup;

  if (invitees.length === 0) {
    return NextResponse.json({}, { status: 404, statusText: 'User not found' });
  }

  // Validate the chosen expansions and the resulting player count (invitees +
  // the sender) against the compatibility matrix and player-count rules (§8).
  const expansions = normaliseExpansions(body.expansions);
  const validation = validateExpansions(expansions, invitees.length + 1);
  if (!validation.ok) {
    return NextResponse.json(
      { errors: validation.errors },
      { status: 400, statusText: validation.errors.join(' ') },
    );
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new SettlementsAndCitiesInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    turnTimer,
    timestamp: new Date().toISOString(),
    gameType: 'SettlementsAndCities',
    gameFriendlyName: 'Settlements and Cities',
    expansions,
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({ success: true });
}
