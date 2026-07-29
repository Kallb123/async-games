import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { areFriends } from '@/utils/mongodb/FriendshipData';
import { getPlayerStats } from '@/utils/mongodb/GameResultData';

export interface IProfileUser {
    userId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
    console.log(`GET ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({}, { status: 400, statusText: "Not signed in" });
    }

    const { userId: profileUserId } = await params;

    await dbConnect();

    if (profileUserId !== userId && !(await areFriends(userId, profileUserId))) {
        return NextResponse.json({}, { status: 403, statusText: "You can only view friends' profiles" });
    }

    const clerkUser = await (await clerkClient()).users.getUser(profileUserId);

    const profileUser: IProfileUser = {
        userId: clerkUser.id,
        username: clerkUser.username,
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
    };

    const { recent, byGame } = await getPlayerStats(profileUserId, userId);

    return NextResponse.json({ success: true, user: profileUser, recent, byGame });
}
