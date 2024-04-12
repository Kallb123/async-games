import { auth, clerkClient } from '@clerk/nextjs'
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { GameDataModel, GameResponse, IGameDataDocument } from '@/utils/mongodb/GameData';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }
  
  await dbConnect();

  const gameDatas: IGameDataDocument[] = await GameDataModel.find({currentTurn: userId}).exec();

  const gameResponses: GameResponse[] = [];
  for(const gameData of gameDatas) {
    const currentTurn = (await clerkClient.users.getUser(gameData.currentTurn)).username ?? "Unknown User";
    const users = await clerkClient.users.getUserList({userId: gameData.userIdList});
    const usernameList = users.map(user => user.username ?? "Unknown User");
    gameResponses.push({
      gameId: gameData.gameId,
      turnTimer: gameData.turnTimer,
      currentTurn,
      usernameList,
      url: gameData.url
    });
  }

  return NextResponse.json({success: true, gameList: gameResponses});
}
