import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { OutbreakInvitationModel, OutbreakInvitationRequest } from '@/games/Outbreak/OutbreakModels';
import { DIFFICULTIES, MAX_PLAYERS, MIN_PLAYERS } from '@/games/Outbreak/board';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<OutbreakInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { userId, host, invitees, turnTimer, body } = setup;

  // Outbreak is 2-4 players (docs/games/outbreak-gdd.md §1); the sender is
  // always a player, so the party size is invitees + 1.
  const playerCount = invitees.length + 1;
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    return NextResponse.json({}, { status: 400, statusText: `Outbreak supports ${MIN_PLAYERS}-${MAX_PLAYERS} players` });
  }

  if (!DIFFICULTIES.some(d => d.id === body.difficulty)) {
    return NextResponse.json({}, { status: 400, statusText: "Unknown difficulty" });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new OutbreakInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    turnTimer,
    difficulty: body.difficulty,
    timestamp: (new Date()).toISOString(),
    gameType: 'Outbreak',
    gameFriendlyName: 'Outbreak'
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({ success: true });
}
