import { NextRequest, NextResponse } from 'next/server';
import clientPromise from "../../../../utils/mongodb/mongodb";

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  const dbClient = await clientPromise;
  const db = dbClient.db("async-games");
  await db.collection("gameInvites").deleteMany({});
  await db.collection("gameData").deleteMany({});

  return NextResponse.json({success: true});
}
