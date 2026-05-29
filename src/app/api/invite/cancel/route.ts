import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { InvitationModel } from '@/utils/mongodb/InvitationData';

export async function POST(request: NextRequest) {
  const { inviteId } = await request.json();
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, message: 'Not signed in' }, { status: 400 });
  }

  if (!inviteId) {
    return NextResponse.json({ success: false, message: 'Missing inviteId' }, { status: 400 });
  }

  await dbConnect();
  const invite = await InvitationModel.findOne({ inviteId }).exec();
  if (!invite) {
    return NextResponse.json({ success: false, message: 'Invite not found' }, { status: 404 });
  }

  if (invite.senderId !== userId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  await InvitationModel.deleteOne({ inviteId }).exec();
  return NextResponse.json({ success: true });
}
