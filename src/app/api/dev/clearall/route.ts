import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from "../../../../utils/mongodb/mongodb";
import { GameDataModel } from '@/utils/mongodb/GameData';
import { InvitationModel } from '@/utils/mongodb/InvitationData';

export async function GET(request: NextRequest) {
  console.log(`GET ${request.nextUrl.pathname}`);

  await deleteAllData();

  return NextResponse.json({success: true});
}

async function deleteAllData() {
  await dbConnect();
  console.log("!!!---!!! Removing all data")
  await InvitationModel.deleteMany({}).exec();
  await GameDataModel.deleteMany({}).exec();
}
