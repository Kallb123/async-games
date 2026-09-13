import { forEachClerkUser } from '@/utils/users/clerk';
import { deleteGuest } from '@/utils/users/guest';
import { isGuest } from '@/utils/ui/players';
import { devWipeRoute } from '../wipeRoute';

// A sweep is a walk over every user in the Clerk instance and then a delete
// apiece, so like the turn-timer sweep it needs more than the platform's
// default few seconds — and its own deadline ten seconds short of that, so it
// stops between deletes and says what it left rather than being cut off
// part-way through one. Nothing is lost by stopping early: the sweep is
// idempotent, and the next click (or the next e2e run) picks up the rest.
export const maxDuration = 60;
const SWEEP_BUDGET_MS = (maxDuration - 10) * 1000;

/**
 * Deletes every unclaimed guest from the Clerk instance — the Clerk-side half
 * of the wipes either side of it, which only ever clear Mongo.
 *
 * A guest is a real, billable Clerk user (docs/account-less-play.md §3), and
 * nothing sweeps the dev instance: `/api/cron/staleguests` only runs on the
 * production deployment (docs/environments.md), so every guest the e2e suite
 * and every manual run of the join flow mints stays there until somebody
 * deletes it by hand. This is that, as a button.
 *
 * It is `staleguests` without the "does this guest still have somewhere to be"
 * check, and deliberately: a guest is only worth keeping for the game or lobby
 * they are sitting in, and on a deployment whose games the button next to this
 * one wipes, there is nothing left for any of them to come back to.
 *
 * The ids are collected first and deleted after the walk, which the cron
 * doesn't have to do. `forEachClerkUser` pages by offset, and deleting while
 * it pages shifts the list underneath it: page 2 starts at offset 200, so a
 * sweep that deleted the whole of page 1 would skip the 100 users that moved
 * up into it — and, since this sweep can delete every user it sees, that is
 * most of the instance rather than an edge of it. The cron gets away with it
 * because it only ever deletes a small, idle minority of each page.
 */
export const GET = devWipeRoute('unclaimed guest accounts', async () => {
    const deadline = Date.now() + SWEEP_BUDGET_MS;

    const guestIds: string[] = [];
    const scanned = await forEachClerkUser(async user => {
        if (isGuest(user)) {
            guestIds.push(user.id);
        }
    });

    // One failure is one guest left behind rather than the end of the sweep —
    // the same isolation `forEachClerkUser` gives the walk, which this half of
    // the work is deliberately outside of.
    let swept = 0;
    let unswept = 0;
    for (const [index, userId] of guestIds.entries()) {
        if (Date.now() >= deadline) {
            unswept = guestIds.length - index;
            console.warn(`Guest sweep ran out of time with ${unswept} guest(s) left to delete`);
            break;
        }
        try {
            await deleteGuest(userId);
            swept++;
        } catch (error) {
            console.error(`Failed to delete guest ${userId}`, error);
        }
    }

    // The only report there is: the buttons don't read their own response, and
    // a sweep over an external service is otherwise invisible.
    console.log(`Removed ${swept} of ${guestIds.length} guest(s), ${scanned} Clerk user(s) scanned`);
});

export const dynamic = 'force-dynamic';
