import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';

export interface IGetGameParams {
    gameid: string
}

export async function GET(request: NextRequest, {params}: { params: Promise<IGetGameParams>}) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        // 401 (not 400) so the client can tell "session cookie not ready yet"
        // apart from a genuine 404 and retry instead of bouncing home — this
        // fires whenever a backgrounded tab's Clerk session cookie is still
        // refreshing when the tab regains focus.
        console.warn(`GET ${request.nextUrl.pathname} 401: no authenticated user`);
        return NextResponse.json({}, {status: 401, statusText: "Not signed in"});
    }
    
    await dbConnect();

    const { gameid } = await params;
    const gameData: IGameDataDocument = await GameDataModel.findOne({gameId: gameid}).exec();
    if (!gameData) {
        return NextResponse.json({}, {status: 404, statusText: "Game not found"});
    }
    const gameDataResponse = await gameData.CreateDataResponse(userId);

    return NextResponse.json({success: true, gameData: gameDataResponse});
}
