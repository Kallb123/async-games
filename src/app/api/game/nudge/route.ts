import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildNudgeNotification } from '@/utils/firebase/notificationContent';
import { readableName } from '@/utils/ui/players';
import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { consumeRateLimit } from '@/utils/rateLimit';

// One nudge per game per clock hour — consumeRateLimit's windows are fixed, so
// nudges either side of the hour boundary both land. Close enough: this is the
// only place in the app where a player can make another player's phone buzz on
// demand, and the button's own "already nudged" state is React state that a
// page reload clears, so the limit that matters is this one. An hour is longer
// than any nudge is useful for and far shorter than the turn timers it sits
// under.
const NUDGE_LIMIT = 1;
const NUDGE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  const thisUser = await currentUser();
  if (!thisUser) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const { gameId } = await request.json();
  if (!gameId) {
    return NextResponse.json({}, {status: 400, statusText: "Missing gameId"});
  }

  await dbConnect();
  const gameData: IGameDataDocument = await GameDataModel.findOne({gameId}).exec();
  if (!gameData) {
    return NextResponse.json({}, {status: 404, statusText: "Game not found"});
  }

  if (!gameData.userIdList.includes(userId)) {
    return NextResponse.json({}, {status: 403, statusText: "Not a player in this game"});
  }

  if (gameData.complete) {
    return NextResponse.json({}, {status: 400, statusText: "Game is already complete"});
  }

  if (gameData.currentTurn === userId) {
    return NextResponse.json({}, {status: 400, statusText: "It's already your turn"});
  }

  // Keyed on the nudger and the game, so one impatient player can't queue up
  // pushes, and the others in the game each still get their own nudge.
  if (!(await consumeRateLimit('nudge', `${gameId}:${userId}`, NUDGE_LIMIT, NUDGE_WINDOW_MS))) {
    return NextResponse.json({}, {status: 429, statusText: "You've already nudged this game recently"});
  }

  const { data: userList } = await (await clerkClient()).users.getUserList({
    userId: [gameData.currentTurn]
  });
  const turnUser = userList.find(u => u.id === gameData.currentTurn);
  if (!turnUser) {
    return NextResponse.json({}, {status: 400, statusText: "Current turn user not found"});
  }

  await sendPushToUsers([turnUser], {
    event: 'TurnNudge',
    gameId,
    link: gameNotificationLink(gameData.gameType.url, gameId)
  }, buildNudgeNotification(readableName(thisUser), gameData), {
    channel: 'turnNudge'
  });

  return NextResponse.json({success: true});
}
