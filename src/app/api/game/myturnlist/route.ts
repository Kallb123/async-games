import { auth, clerkClient } from '@clerk/nextjs'
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from "../../../../utils/mongodb/mongodb";
import { GameData, GameResponse } from '@/utils/mongodb/GameData';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({}, {status: 400, statusText: "Not signed in"});
  }

  const dbClient = await clientPromise;
  const db = dbClient.db("async-games");

  // @ts-ignore
  const gameDatas: GameData[] = await db.collection("gameData").find({currentTurn: userId}).toArray();

  const gameResponses: GameResponse[] = [];
  for(const gameData of gameDatas) {
    const currentTurn = (await clerkClient.users.getUser(gameData.currentTurn)).username ?? "Unknown User";
    const users = await clerkClient.users.getUserList({userId: gameData.userIdList});
    const usernameList = users.map(user => user.username ?? "Unknown User");
    gameResponses.push({
      gameId: gameData.gameId,
      turnTimer: gameData.turnTimer,
      currentTurn,
      usernameList
    });
  }

  return NextResponse.json({success: true, gameList: gameResponses});
}
