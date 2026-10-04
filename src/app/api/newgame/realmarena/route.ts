import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { RealmArenaInvitationModel, RealmArenaInvitationRequest } from '@/games/RealmArena/RealmArenaModels';
import { meta } from '@/games/RealmArena/meta';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';
import { partySizeErrorMessage } from '@/utils/ui/games';

// docs/games/realm-arena.md §17.3 PR 4.
export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<RealmArenaInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { body, userId, host, invitees, turnTimer } = setup;

  // Two to four players (§17.4 B2); the sender is always one of them. Read
  // off `meta`, as the lobby routes are; a guard test holds `meta` to the
  // party sizes the maps can deploy.
  const partySizeError = partySizeErrorMessage(meta, invitees.length + 1);
  if (partySizeError) {
    return NextResponse.json({}, { status: 400, statusText: partySizeError });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new RealmArenaInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    // Fog of war (§27), only when the host turned it on.
    fog: body.fog === true,
    turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'RealmArena',
    gameFriendlyName: meta.name
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({ success: true });
}
