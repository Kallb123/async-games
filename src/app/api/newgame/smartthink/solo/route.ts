import { NextRequest, NextResponse } from 'next/server';
import { requireGameHost } from '@/utils/api/gameSetupRequest';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { CreateSmartthinkSoloGameData, SmartthinkGameDataModel } from '@/games/Smartthink/SmartthinkModels';
import { readableName } from '@/utils/ui/players';

export async function POST(request: NextRequest) {
  console.log(`POST ${request.nextUrl.pathname}`);

  const setup = await requireGameHost();
  if ('error' in setup) {
    return setup.error;
  }
  const { userId, host } = setup;

  await dbConnect();

  const gameData = CreateSmartthinkSoloGameData(userId, readableName(host, userId), '1d');

  const gameDataM = new SmartthinkGameDataModel(gameData);
  await gameDataM.save();

  return NextResponse.json({ success: true, gameId: gameData.gameId, gameUrl: gameData.gameType.url });
}
