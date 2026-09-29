import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { areFriends } from '@/utils/mongodb/FriendshipData';
import { gameResultResponse } from '@/utils/api/gameResultResponse';

export async function GET(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }

    const { gameId } = await params;

    await dbConnect();

    const result = await GameResultModel.findOne({ gameId }).exec();
    if (!result) {
        return NextResponse.json({}, { status: 404, statusText: "Game result not found" });
    }

    const playerIds: string[] = result.playerIds;
    if (!playerIds.includes(userId)) {
        const friendChecks = await Promise.all(playerIds.map(playerId => areFriends(userId, playerId)));
        if (!friendChecks.some(Boolean)) {
            return NextResponse.json({}, { status: 403, statusText: "You can only view results you played or a friend played" });
        }
    }

    return NextResponse.json({ success: true, result: await gameResultResponse(result, userId) });
}
