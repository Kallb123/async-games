import { readJsonBody } from '@/utils/api/requestBody';
import { auth } from '@clerk/nextjs/server';
import { after, NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { finishGame } from '@/utils/games/finishGame';

export async function POST(request: NextRequest) {
  const { gameId } = await readJsonBody(request);
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

  // Ending a game by hand goes through the same finish path as winning one or
  // having it abandoned — which is also what now tells the other players it is
  // over. Before, a surrender was silent: everyone else kept waiting on a game
  // that had already written its result.
  const finished = await finishGame(gameData, { endReason: "ended" });
  if (!finished.saved) {
    return NextResponse.json({ success: false, message: 'Game state changed, please try again' }, { status: 409 });
  }

  // Recording the match result and telling the table is a stats write and a
  // fan-out of pushes, neither of which this response depends on, so both run
  // after it has flushed.
  after(finished.announce);

  return NextResponse.json({ success: true });
}
