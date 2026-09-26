import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { dbConnect } from '../../../../utils/mongodb/mongodb';
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { attachHistoryReactions } from '@/utils/games/historyReactions';
import { ServerTiming, timedJson } from '@/utils/api/serverTiming';
export interface IGetGameParams { gameid: string }
export async function GET(request: NextRequest, { params }: { params: Promise<IGetGameParams> }) {
  console.log(`GET ${request.nextUrl.pathname}`);
  const timing = new ServerTiming();
  const { userId } = await timing.time('auth', auth);
  if (!userId) return timedJson({}, timing, { status: 401, statusText: 'Not signed in' });
  await timing.time('mongo_connect', dbConnect);
  const { gameid } = await params;
  const gameData = await timing.time('mongo_query', () => GameDataModel.findOne({ gameId: gameid }).exec()) as IGameDataDocument | null;
  if (!gameData) return timedJson({}, timing, { status: 404, statusText: 'Game not found' });
  if (!gameData.userIdList.includes(userId)) return timedJson({}, timing, { status: 403, statusText: 'Not a player in this game' });
  const gameDataResponse = await timing.time('response', () => gameData.CreateDataResponse(userId));
  gameDataResponse.gameState.history = await timing.time('reactions', () => attachHistoryReactions(gameid, gameDataResponse.gameState.history));
  return timedJson({ success: true, gameData: gameDataResponse }, timing);
}
