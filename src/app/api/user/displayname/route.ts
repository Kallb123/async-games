import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody } from '@/utils/api/requestBody';
import { clientIp, consumeRateLimit } from '@/utils/rateLimit';
import { DISPLAY_NAME_RULE, isValidDisplayName } from '@/utils/users/displayName';
import { publicHandle } from '@/utils/ui/players';

// Renaming yourself is cheap for the player and noisy for everyone else — the
// name is on every seat list, every history line and every push their table
// reads. Generous enough that nobody trying names out will meet it.
const DISPLAY_NAME_LIMIT = 20;
const DISPLAY_NAME_WINDOW_MS = 60 * 60 * 1000;

// Metered by IP as well as by account, because accounts here are free to mint:
// /api/lobby/join hands out a real Clerk principal to anyone with a join code,
// each arriving with an untouched per-account budget. Without this, one host
// can turn ~120 guests an hour into a few thousand Clerk writes, and the
// quota it exhausts is the one every name in the app resolves through.
const DISPLAY_NAME_IP_LIMIT = 100;

/** The refusal a player is actually shown. */
function refuse(status: number, message: string) {
    // In the body rather than in `statusText`, for two reasons. HTTP/2 dropped
    // the reason phrase, so a browser reads statusText as "" for anything
    // served in production and every refusal here would reach the player as
    // their caller's generic fallback. And statusText is a header value, so a
    // sentence with a dash or a curly quote in it throws on the way out —
    // turning a 400 anybody could hit into a 500.
    return NextResponse.json({ error: message }, { status });
}

/**
 * Setting the name other players see (docs/dynamic-names.md §5).
 *
 * A route rather than a browser write to Clerk, which is what a *handle*
 * change is (see NameForm). Two reasons, and only the second is Clerk's:
 *
 * 1. This is the one string every other player at the table reads, in copy
 *    none of them can dismiss. `docs/account-less-play.md` §14 already settled
 *    that a player does not get to name themselves in front of others without
 *    the server having a say — that is why the client stopped stamping
 *    `senderUsername`. A name written straight to Clerk from the browser is
 *    the same thing by another route: `isValidDisplayName` in the form would
 *    be a suggestion, and dev-tools could send a thousand characters of
 *    anything.
 * 2. `publicMetadata` is readable from the Frontend API but writable only from
 *    the Backend API, so there is no browser-side write to choose instead.
 */
export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    const { userId } = await auth();
    if (!userId) {
        return refuse(400, "Not signed in");
    }

    // Metered before the Clerk read below rather than after it, so a caller
    // spamming bodies this route will reject still spends their allowance:
    // currentUser() is a Backend API call, and a refusal underneath it would
    // be a free way to burn the quota that every name in the app resolves
    // through.
    if (!(await consumeRateLimit('display-name', userId, DISPLAY_NAME_LIMIT, DISPLAY_NAME_WINDOW_MS))
        || !(await consumeRateLimit('display-name-ip', clientIp(request.headers), DISPLAY_NAME_IP_LIMIT, DISPLAY_NAME_WINDOW_MS))) {
        return refuse(429, "Too many name changes. Please try again later.");
    }

    const user = await currentUser();
    if (!user) {
        return refuse(400, "Not signed in");
    }

    const { displayName } = await readJsonBody(request);
    if (typeof displayName !== 'string') {
        return refuse(400, "No display name provided");
    }

    const next = displayName.trim();
    // Clearing it is "just go by my handle", so it is only allowed to somebody
    // who has one. Without that, a guest could blank the only name they have
    // and turn themselves into "Someone" at every table they are sitting at.
    if (!next && !publicHandle(user)) {
        return refuse(400, "You need a display name — you have no username to go by instead.");
    }
    if (next && !isValidDisplayName(next)) {
        return refuse(400, DISPLAY_NAME_RULE);
    }

    // Deep-merged, so this touches `displayName` and leaves `guest` and
    // `unlocked` — the other things living in this bag — alone. null removes
    // the key rather than storing an empty string, so `chosenName` sees the
    // absence rather than having to treat "" as one.
    await (await clerkClient()).users.updateUserMetadata(userId, {
        publicMetadata: { displayName: next || null },
    });

    return NextResponse.json({ displayName: next });
}
