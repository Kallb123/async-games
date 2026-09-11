import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { BannedIsletInvitationModel, BannedIsletInvitationRequest } from '@/games/BannedIslet/BannedIsletModels';
import { DIFFICULTIES, MAX_PLAYERS, MIN_PLAYERS } from '@/games/BannedIslet/board';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<BannedIsletInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { userId, host, invitees, turnTimer, body } = setup;

  // Banned Islet is 2-4 adventurers (docs/games/banned-islet.md §1); the
  // sender is always a player, so the party size is invitees + 1.
  const playerCount = invitees.length + 1;
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    return NextResponse.json({}, { status: 400, statusText: `Banned Islet supports ${MIN_PLAYERS}-${MAX_PLAYERS} players` });
  }

  if (!DIFFICULTIES.some(d => d.id === body.difficulty)) {
    return NextResponse.json({}, { status: 400, statusText: "Unknown difficulty" });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new BannedIsletInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    turnTimer,
    difficulty: body.difficulty,
    timestamp: (new Date()).toISOString(),
    gameType: 'BannedIslet',
    gameFriendlyName: 'Banned Islet'
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({ success: true });
}
