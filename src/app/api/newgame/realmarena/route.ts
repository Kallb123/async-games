import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { battleSizeOf, coopInviteOf, RealmArenaInvitationModel, RealmArenaInvitationRequest } from '@/games/RealmArena/RealmArenaModels';
import { COOP_PLAYERS, fitsCoop, playableFactionsOf } from '@/games/RealmArena/characters';
import { meta } from '@/games/RealmArena/meta';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';
import { partySizeErrorMessage } from '@/utils/ui/games';
import { UNLIMITED_TURN_TIMER } from '@/utils/games/TurnTimer';

// docs/games/realm-arena.md §17.3 PR 4, co-op's setting (§29.8), the
// battle's size and difficulty (§30.5), the factions the players may muster
// from (B6), and solo against the computer (§30.6).
export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<RealmArenaInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { body, userId, host, invitees, turnTimer } = setup;

  // Co-op against the computer (§29.8), when the request asks for it: an
  // enemy that is a faction or Random, a known mission and difficulty.
  // Anything else it sent for `coop` is refused rather than read as a
  // free-for-all the host didn't choose.
  const coop = coopInviteOf(body.coop);
  if (body.coop != null && !coop) {
    return NextResponse.json({}, { status: 400, statusText: "Unknown co-op setting" });
  }

  // Solo (§30.6) is co-op with a team of one: nobody to invite, so the setup
  // screen accepts the invitation itself and the battle starts at once
  // (useStartSoloGame). Told apart by the request saying so, not by an empty
  // invitee list, so a host who invited only themselves is refused as the
  // party of one they are rather than quietly dealt a solo battle.
  const solo = body.solo === true;
  if (solo) {
    if (invitees.length > 0) {
      return NextResponse.json({}, { status: 400, statusText: "A solo battle has nobody to invite" });
    }
    if (!coop) {
      return NextResponse.json({}, { status: 400, statusText: "A solo battle is fought against the computer" });
    }
    // Solo is fought on the Ruined Fort (§29.2); the Sacked Fort is built for a team of two or three (§30.9).
    if (coop.map) {
      return NextResponse.json({}, { status: 400, statusText: "A solo battle is fought on the Ruined Fort" });
    }
  } else {
    // Two to four players (§17.4 B2); the sender is always one of them. Read
    // off `meta`, as the lobby routes are; a guard test holds `meta` to the
    // party sizes the maps can deploy.
    const partySizeError = partySizeErrorMessage(meta, invitees.length + 1);
    if (partySizeError) {
      return NextResponse.json({}, { status: 400, statusText: partySizeError });
    }
    // A co-op team the host invites is two or three, which its battlefields are built for.
    if (coop && !fitsCoop(invitees.length + 1)) {
      return NextResponse.json({}, { status: 400, statusText: `Co-op is for up to ${COOP_PLAYERS.max} players` });
    }
  }
  // The battle's size (§30.5): small or large when sent, normal when absent,
  // and anything else refused rather than read as a size the host didn't choose.
  const size = battleSizeOf(body.size);
  if (body.size != null && !size) {
    return NextResponse.json({}, { status: 400, statusText: "Unknown battle size" });
  }

  // The factions the players may muster from (B6): at least one known
  // faction when sent, the Realm alone when absent, and anything else
  // refused rather than read as a choice the host didn't make.
  const factions = playableFactionsOf(body.factions);
  if (body.factions != null && !factions) {
    return NextResponse.json({}, { status: 400, statusText: "Choose at least one faction" });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new RealmArenaInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    // Fog of war (§27), only when the host turned it on.
    fog: body.fog === true,
    coop,
    size,
    factions,
    // Nobody to time out against, so a solo battle is never swept, warned or
    // dropped, and simply waits (§30.6), as a Solitaire game does.
    turnTimer: solo ? UNLIMITED_TURN_TIMER : turnTimer,
    timestamp: (new Date()).toISOString(),
    gameType: 'RealmArena',
    gameFriendlyName: meta.name
  });

  await invite.save();

  if (!solo) {
    await sendGameInvitePush(invitees, host, invite);
  }

  // The inviteId is what the solo setup screen accepts with; a host who
  // invited others has nothing to do with it and ignores it.
  return NextResponse.json({ success: true, inviteId: invite.inviteId });
}
