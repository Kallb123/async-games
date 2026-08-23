import { clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { isAuthorisedCron } from '@/utils/cronAuth';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { GameResultModel } from '@/utils/mongodb/GameResultData';
import { InvitationModel } from '@/utils/mongodb/InvitationData';
import { deleteGuest, GUEST_SWEEP_DAYS } from '@/utils/users/guest';
import { isGuest } from '@/utils/ui/players';

const PAGE_SIZE = 100;
// Belt and braces against a paging bug turning into an unbounded loop.
const MAX_PAGES = 100;

const GUEST_SWEEP_MS = GUEST_SWEEP_DAYS * 24 * 60 * 60 * 1000;

// Whether a guest with no GameResult yet is still worth keeping around: a
// live, unfinished game (docs/account-less-play.md §8 — "a guest in a live
// game is never swept, however long the game runs"), or a lobby that hasn't
// expired yet. Neither has a timestamp to wait out — there's nothing keeping
// them once both come back empty, which is what "swept on the lobby's
// expiresAt" comes down to once that lobby's own TTL index has reaped it:
// the invitation is simply gone by the time this runs.
async function stillHasSomewhereToBe(userId: string): Promise<boolean> {
    if (await GameDataModel.exists({ userIdList: userId })) {
        return true;
    }
    return !!(await InvitationModel.exists({
        'userIdList.userId': userId,
        expiresAt: { $gt: new Date() },
    }));
}

// A guest is swept GUEST_SWEEP_DAYS after their last game concluded — the
// most recent endedAt across every GameResult carrying their id, one query
// on the existing { playerIds: 1, endedAt: -1 } index. Undefined means no
// GameResult exists at all (a lobby that never started a game).
async function lastGameEndedAt(userId: string): Promise<string | undefined> {
    const latest = await GameResultModel.findOne({ playerIds: userId })
        .sort({ endedAt: -1 })
        .select({ endedAt: 1 })
        .lean()
        .exec();
    return latest?.endedAt;
}

/**
 * Deletes unclaimed guest accounts (docs/account-less-play.md §8, step 17) —
 * a guest is a real, billable Clerk user (§3), so one who never comes back to
 * claim their account is a ghost this reaps rather than leaves running up the
 * MAU count forever. Deleting the Clerk user is safe by the time this runs:
 * a finished game already copied the guest's display name onto its
 * GameResult (step 13), and an unresolvable id renders as a placeholder
 * rather than misaligning any other player's name (#240).
 */
export async function GET(request: NextRequest) {
    console.log(`GET ${request.nextUrl.pathname}`);

    if (!isAuthorisedCron(request)) {
        return NextResponse.json({}, { status: 401, statusText: 'Unauthorized' });
    }

    await dbConnect();
    const client = await clerkClient();

    let scanned = 0;
    let guests = 0;
    let swept = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
        const { data: users } = await client.users.getUserList({
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
        });
        if (!users.length) {
            break;
        }
        scanned += users.length;

        for (const user of users) {
            if (!isGuest(user)) {
                continue;
            }
            guests++;

            const endedAt = await lastGameEndedAt(user.id);
            const sweepable = endedAt
                ? Date.now() - new Date(endedAt).getTime() >= GUEST_SWEEP_MS
                : !(await stillHasSomewhereToBe(user.id));
            if (!sweepable) {
                continue;
            }

            await deleteGuest(user.id);
            swept++;
        }

        if (users.length < PAGE_SIZE) {
            break;
        }
    }

    console.log(`Swept ${swept} unclaimed guest(s) of ${guests} scanned, ${GUEST_SWEEP_DAYS}+ days idle`);

    return NextResponse.json({ scanned, guests, swept, sweepAfterDays: GUEST_SWEEP_DAYS });
}
