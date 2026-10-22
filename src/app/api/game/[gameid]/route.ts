import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { dbConnect } from '../../../../utils/mongodb/mongodb';
import { readGameForViewer } from '@/utils/games/readGame';
import { ServerTiming, timedJson } from '@/utils/api/serverTiming';
import { warmUpResponse } from '@/utils/api/warmUp';
export interface IGetGameParams { gameid: string }
/** The board's warm-up ping: see `warmUpResponse`. It never looks at the id, so it can't say whether a game exists. */
export const HEAD = warmUpResponse;
const REFUSED = { 404: 'Game not found', 403: 'Not a player in this game' } as const;
export async function GET(request: NextRequest, { params }: { params: Promise<IGetGameParams> }) {
  console.log(`GET ${request.nextUrl.pathname}`);
  const timing = new ServerTiming();
  const { userId } = await timing.time('auth', auth);
  if (!userId) return timedJson({}, timing, { status: 401, statusText: 'Not signed in' });
  timing.noteInstance();
  await timing.time('mongo_connect', dbConnect);
  const { gameid } = await params;
  const read = await readGameForViewer(gameid, userId, (name, work) => timing.time(name, work));
  if ('status' in read) return timedJson({}, timing, { status: read.status, statusText: REFUSED[read.status] });
  return timedJson({ success: true, gameData: read.gameData }, timing);
}
