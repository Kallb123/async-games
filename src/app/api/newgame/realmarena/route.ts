import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { COOP_PLAYERS, coopInviteOf, RealmArenaInvitationModel, RealmArenaInvitationRequest } from '@/games/RealmArena/RealmArenaModels';
import { meta } from '@/games/RealmArena/meta';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';
import { partySizeErrorMessage } from '@/utils/ui/games';

// docs/games/realm-arena.md §17.3 PR 4, and co-op's setting (§29.8).
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

  // Co-op against the computer (§29.8), when the request asks for it: an
  // enemy that is a faction or Random, and a team of two or three, which its
  // battlefields are built for. Anything else it sent for `coop` is refused
  // rather than read as a free-for-all the host didn't choose.
  const coop = body.coop == null ? undefined : coopInviteOf(body.coop);
  if (body.coop != null && !coop) {
    return NextResponse.json({}, { status: 400, statusText: "Unknown enemy" });
  }
  const players = invitees.length + 1;
  if (coop && (players < COOP_PLAYERS.min || players > COOP_PLAYERS.max)) {
    return NextResponse.json({}, { status: 400, statusText: `Co-op is for ${COOP_PLAYERS.min}–${COOP_PLAYERS.max} players` });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new RealmArenaInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    // Fog of war (§27), only when the host turned it on.
    fog: body.fog === true,
    coop,
    turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'RealmArena',
    gameFriendlyName: meta.name
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({ success: true });
}
