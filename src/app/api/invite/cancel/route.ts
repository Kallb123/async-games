import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { InvitationModel, IInvitationDataDocument } from '@/utils/mongodb/InvitationData';
import { sendPushToUsers } from '@/utils/firebase/pushNotification';

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

  // Refresh the invitees live so a cancelled invite disappears from their
  // incoming list without a manual reload (silent, data-only push).
  const inviteeIds = invite.userIdList.map(uid => uid.userId);
  if (inviteeIds.length) {
    const { data: invitees } = await (await clerkClient()).users.getUserList({ userId: inviteeIds });
    await sendPushToUsers(invitees, {
      event: 'InviteCancelled',
      inviteId
    });
  }

  return NextResponse.json({ success: true });
}
