import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { SolitaireInvitationModel, SolitaireInvitationRequest } from '@/games/Solitaire/SolitaireModels';
import { UNLIMITED_TURN_TIMER } from '@/utils/games/TurnTimer';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';
import { canHostGame } from '@/utils/users/clerk';

// Solitaire is solo, so there's nobody to invite: userIdList is always empty,
// which makes /api/invite/accept's "has everyone accepted?" check vacuously
// true the moment it's called. The setup page creates this invite then
// immediately calls the existing accept endpoint to complete game creation -
// no special-casing of that generic route beyond the one game-start branch
// every game needs anyway.
export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);
  const solitaireRequest: SolitaireInvitationRequest = await request.json();

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
  }
  // Every lobby needs a real, registered host — see canHostGame's own
  // comment (docs/account-less-play.md §8).
  if (!canHostGame(thisUser)) {
    return NextResponse.json({}, { status: 403, statusText: "Account not unlocked" });
  }

  await dbConnect();

  const invite: IInvitationDataDocument = new SolitaireInvitationModel({
    inviteId: randomUUID(),
    senderId: userId,
    userIdList: [],
    turnTimer: UNLIMITED_TURN_TIMER,
    timestamp: (new Date()).toISOString(),
    gameType: 'Solitaire',
    gameFriendlyName: 'Solitaire',
    drawMode: solitaireRequest.drawMode,
  });

  await invite.save();

  return NextResponse.json({ success: true, inviteId: invite.inviteId });
}
