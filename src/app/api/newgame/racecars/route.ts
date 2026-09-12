import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readGameSetupRequest, seatsFor } from '@/utils/api/gameSetupRequest';
import { sendGameInvitePush } from '@/utils/firebase/invitePush';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { RaceCarsInvitationModel, RaceCarsInvitationRequest } from '@/games/RaceCars/RaceCarsModels';
import { MAX_PLAYERS, MIN_PLAYERS, readRaceSettings } from '@/games/RaceCars/board';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await readGameSetupRequest<RaceCarsInvitationRequest>(request);
  if ('error' in setup) {
    return setup.error;
  }
  const { userId, host, invitees, turnTimer, body } = setup;

  // Race Cars seats 2-6 (docs/games/race-cars.md §5.2's six grid slots); the
  // sender is always a driver, so the party size is invitees + 1. The bound is
  // the route's own and is not optional: a seventh driver reads
  // `grid[6] === undefined` and parks a car at an undefined row with a
  // duplicate race number (§23.4).
  const playerCount = invitees.length + 1;
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    return NextResponse.json({}, { status: 400, statusText: `Race Cars supports ${MIN_PLAYERS}-${MAX_PLAYERS} players` });
  }

  // The same helper `buildInitialRaceCarsState` normalises through, rather
  // than a copy of the three lists here — which is what stops the lobby path
  // (POST /api/lobby, the other way a race gets created) being the one that
  // was forgotten. Here it answers 400; there it snaps to the defaults.
  const { settings, rejection } = readRaceSettings(body);
  if (rejection) {
    return NextResponse.json({}, { status: 400, statusText: rejection });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new RaceCarsInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: seatsFor(invitees),
    turnTimer,
    distance: settings.distance,
    spec: settings.spec,
    oilSpills: settings.oilSpills,
    timestamp: (new Date()).toISOString(),
    gameType: 'RaceCars',
    gameFriendlyName: 'Race Cars'
  });

  await invite.save();

  await sendGameInvitePush(invitees, host, invite);

  return NextResponse.json({ success: true });
}
