import { auth } from '@clerk/nextjs'
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';

export interface IGetGameParams {
    gameid: string
}

export async function GET(request: NextRequest, {params}: { params: IGetGameParams}) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = auth();
    if (!userId) {
        return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
    }
    
    await dbConnect();

    const gameData: IGameDataDocument = await GameDataModel.findOne({gameId: params.gameid}).exec();
    if (!gameData) {
        return NextResponse.json({}, {status: 404, statusText: "Game not found"});
    }
    const gameDataResponse = await gameData.CreateDataResponse();

    return NextResponse.json({success: true, gameData: gameDataResponse});
}
