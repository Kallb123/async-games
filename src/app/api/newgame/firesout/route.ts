import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { FiresOutInvitationModel, IFiresOutInvitationRequest } from '@/games/FiresOut/FiresOutModels';
import { DIFFICULTY_TIERS, MAX_PLAYERS, MIN_PLAYERS } from '@/games/FiresOut/board';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

const RULESETS = ['family', 'experienced'] as const;

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<IFiresOutInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { userId, host, invitees, turnTimer, body } = setup;

  // fires-out-gdd.md §17.3: 2-6 players for now — one figure per player,
  // through the ordinary invite flow. Solo/multi-pawn play is a later step.
  const playerCount = invitees.length + 1;
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    return NextResponse.json({}, { status: 400, statusText: `Fires Out! supports ${MIN_PLAYERS}-${MAX_PLAYERS} players` });
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
    timestamp: (new Date()).toISOString(),
    gameType: 'FiresOut',
    gameFriendlyName: 'Fires Out!'
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({ success: true });
}
