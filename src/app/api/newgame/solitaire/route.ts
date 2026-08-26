import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireGameHost } from '@/utils/api/gameSetupRequest';
import { readJsonBody } from '@/utils/api/requestBody';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { SolitaireInvitationModel, SolitaireInvitationRequest } from '@/games/Solitaire/SolitaireModels';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';
import { UNLIMITED_TURN_TIMER } from '@/utils/games/TurnTimer';

/**
 * Solitaire is solo, so there is nobody to invite and no turn timer to choose
 * — the invitation exists only because starting a game goes through one, and
 * it is consumed immediately. No `readGameSetupRequest` for that reason: there
 * is no invitee list or timer for it to validate. It still needs a host.
 */
export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const solitaireRequest = await readJsonBody<SolitaireInvitationRequest>(request);

  const setup = await requireGameHost();
  if ('error' in setup) {
    return setup.error;
  }

  // The one setting this game takes, checked rather than trusted — it came off
  // the request body and went straight into the document, and the deal reads
  // it back as `drawMode === 'DRAW_3' ? … : …`, so anything else silently
  // dealt a Draw-1 game while the record claimed something meaningless.
  const { drawMode } = solitaireRequest;
  if (drawMode !== 'DRAW_1' && drawMode !== 'DRAW_3') {
    return NextResponse.json({}, { status: 400, statusText: "Unknown draw mode" });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new SolitaireInvitationModel({
    inviteId: randomUUID(),
    senderId: setup.userId,
    userIdList: [],
    turnTimer: UNLIMITED_TURN_TIMER,
    timestamp: (new Date()).toISOString(),
    gameType: 'Solitaire',
    gameFriendlyName: 'Solitaire',
    drawMode,
  });

  await invite.save();

  return NextResponse.json({ success: true, inviteId: invite.inviteId });
}
