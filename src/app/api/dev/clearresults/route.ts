import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { GameResultModel } from '@/utils/mongodb/GameResultData';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  await deleteAllData();

  return NextResponse.json({success: true});
}

async function deleteAllData() {
  await dbConnect();
  console.log("!!!---!!! Removing result data")
  await GameResultModel.deleteMany({}).exec();
}

export const dynamic = 'force-dynamic';
