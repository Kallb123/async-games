import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { InvitationModel, IInvitationDataDocument } from '@/utils/mongodb/InvitationData';

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
  const invite: IInvitationDataDocument | null = await InvitationModel.findOne({ inviteId }).exec();
  if (!invite) {
    return NextResponse.json({ success: false, message: 'Invite not found' }, { status: 404 });
  }

  if (invite.senderId !== userId) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  await InvitationModel.deleteOne({ inviteId }).exec();

  // The invitees are not pushed. A cancelled invite is not worth interrupting
  // anyone for, and a data-only push to make their list re-fetch is the thing
  // that costs iOS players their notifications — their incoming list picks it
  // up on its next foreground (see useRefreshableData).

  return NextResponse.json({ success: true });
}
