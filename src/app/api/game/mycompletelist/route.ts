import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { IGameResponse } from '@/utils/apiModels/GameDataApi';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  
  await dbConnect();

  const gameDatas: IGameDataDocument[] = await GameDataModel.find({complete: true, userIdList: userId}).exec();

  const gameResponses: IGameResponse[] = await Promise.all(gameDatas.map(async gameData => await gameData.CreateResponse()));

  return NextResponse.json({success: true, gameList: gameResponses});
}
