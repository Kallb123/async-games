import { auth, clerkClient } from '@clerk/nextjs/server';
import { after, NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel, trySave } from '@/utils/mongodb/GameData';
import { recordGameResult } from '@/utils/mongodb/GameResultData';
import { unclaimedGuestsOf } from '@/utils/users/guest';

export async function POST(request: NextRequest) {
  const { gameId } = await request.json();
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Not signed in' }, { status: 400 });
  }

  if (!gameId) {
    return NextResponse.json({ success: false, message: 'Missing gameId' }, { status: 400 });
  }

  await dbConnect();
  const gameData = await GameDataModel.findOne({ gameId }).exec();
  if (!gameData) {
    return NextResponse.json({ success: false, message: 'Game not found' }, { status: 404 });
  }

  if (!gameData.userIdList.includes(userId)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  if (gameData.complete) {
    return NextResponse.json({ success: true, message: 'Game already ended' });
  }

  gameData.complete = true;
  gameData.winner = "";
  gameData.endReason = "ended";
  if (!(await trySave(gameData))) {
    return NextResponse.json({ success: false, message: 'Game state changed, please try again' }, { status: 409 });
  }

  // Recording the match result is a stats read-model write nothing in this
  // response depends on, so it runs after the response has flushed. It's
  // idempotent on gameId, so a retried request is a no-op.
  after(async () => {
    try {
      const { data: userList } = await (await clerkClient()).users.getUserList({
        userId: gameData.userIdList
      });

      const { unclaimedPlayerIds, guestNames } = unclaimedGuestsOf(userList);
      await recordGameResult(gameData, unclaimedPlayerIds, guestNames);
    } catch (error) {
      console.error(`Post-response result recording failed for game ${gameData.gameId}`, error);
    }
  });

  return NextResponse.json({ success: true });
}
