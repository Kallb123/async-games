import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { FiresOutInvitationModel, IFiresOutInvitationRequest } from '@/games/FiresOut/FiresOutModels';
import { DIFFICULTY_TIERS, MAX_PLAYERS, MAX_SOLO_CREW, MIN_PLAYERS, MIN_SOLO_CREW } from '@/games/FiresOut/board';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

const RULESETS = ['family', 'experienced'] as const;

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<IFiresOutInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { userId, host, invitees, turnTimer, body } = setup;

  // fires-out-gdd.md §1 offers two modes and this route serves both, told
  // apart by whether anybody was invited. The crew game (§17.3) is 2-6
  // players, one figure each, through the ordinary invite flow; §1's
  // solitaire play (§17.6 step 12) is one player holding a whole crew, which
  // is an invitation with nobody in its `userIdList` at all — Solitaire's
  // shape exactly (docs/new-game.md's solo gotcha: /api/invite/accept's "has
  // everyone accepted?" is vacuously true for an empty list, so the setup
  // page accepts its own invitation and the game starts on the first call).
  const solo = invitees.length === 0;

  if (solo) {
    // The one setting the solo mode takes, checked rather than trusted — it
    // came off the request body and decides how many figures CreateGame deals
    // (which clamps it again, since a lobby invitation can carry one too).
    const { crewSize } = body;
    if (!Number.isInteger(crewSize) || crewSize! < MIN_SOLO_CREW || crewSize! > MAX_SOLO_CREW) {
      return NextResponse.json({}, { status: 400, statusText: `A solo crew is ${MIN_SOLO_CREW}-${MAX_SOLO_CREW} firefighters` });
    }
  } else {
    const playerCount = invitees.length + 1;
    if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
      return NextResponse.json({}, { status: 400, statusText: `Fires Out! supports ${MIN_PLAYERS}-${MAX_PLAYERS} players in a crew` });
    }
  }

  if (!RULESETS.some(r => r === body.ruleset)) {
    return NextResponse.json({}, { status: 400, statusText: "Unknown ruleset" });
  }
  if (!DIFFICULTY_TIERS.some(d => d.id === body.difficulty)) {
    return NextResponse.json({}, { status: 400, statusText: "Unknown difficulty" });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new FiresOutInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    turnTimer,
    ruleset: body.ruleset,
    difficulty: body.difficulty,
    // Left off a crew invitation entirely rather than stored as the party
    // size: CreateGame only consults it for a one-seat game, and a stored
    // duplicate of something it can already count is a second source of truth
    // for how many figures the board holds.
    crewSize: solo ? body.crewSize : undefined,
    timestamp: (new Date()).toISOString(),
    gameType: 'FiresOut',
    gameFriendlyName: 'Fires Out!'
  });

  await invite.save();

  if (!solo) {
    await sendGameInvitePush(invitees, host, invite);
  }

  // The inviteId is what the solo setup page accepts with; a crew host has
  // nothing to do with it and ignores it.
  return NextResponse.json({ success: true, inviteId: invite.inviteId });
}
