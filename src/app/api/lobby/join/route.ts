import { readJsonBody } from '@/utils/api/requestBody';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/utils/mongodb/mongodb';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { OPEN_SEAT_CLAIM_FILTER, isOpenSeat, isSeatedAt, notSeatedFilter, openSeats, pendingSeatFor } from '@/utils/games/lobby';
import { normaliseJoinCode } from '@/utils/games/joinCode';
import { uniqueGuestName } from '@/utils/games/guestName';
import { isValidDisplayName } from '@/utils/users/displayName';
import { acceptSeat } from '@/utils/games/startGame';
import { createGuest, deleteGuest } from '@/utils/users/guest';
import { buildResumeHref } from '@/utils/users/resumeLink';
import { userIdListToUsernameList } from '@/utils/users/clerk';
import { clientIp, consumeRateLimit } from '@/utils/rateLimit';

export interface ILobbyJoinRequest {
    joinCode: string;
    // Present only for a signed-out visitor claiming a seat as a guest
    // (docs/account-less-play.md §14) — ignored for a signed-in join.
    name?: string;
}

// The app's first public write endpoint — a guest claims a seat with no
// session at all — so a script walking the 234k-code space gets throttled
// here rather than being free to hammer it (docs/account-less-play.md §4).
// Generous enough that a real player mistyping a code a few times, or two
// devices racing the same lobby, never trips it.
const JOIN_RATE_LIMIT = 20;
const JOIN_RATE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
    console.log(`POST ${request.nextUrl.pathname}`);

    await dbConnect();

    if (!(await consumeRateLimit('lobby-join', clientIp(request.headers), JOIN_RATE_LIMIT, JOIN_RATE_WINDOW_MS))) {
        return NextResponse.json({}, { status: 429, statusText: "Too many attempts — try again shortly." });
    }

    const { userId } = await auth();

    const { joinCode: typedCode, name } = await readJsonBody<ILobbyJoinRequest>(request);
    if (!typedCode) {
        return NextResponse.json({}, { status: 400, statusText: "Missing join code" });
    }
    const joinCode = normaliseJoinCode(typedCode);

    // Closes the window between a lobby actually expiring and the TTL index
    // reaping it.
    const openLobby = { joinCode, expiresAt: { $gt: new Date() } };

    // One conditional update, not read-modify-write: matching an unclaimed
    // seat (OPEN_SEAT_CLAIM_FILTER) that isn't already this player's
    // (notSeatedFilter) in the same query that finds the lobby is what makes
    // the claim atomic. Two guests racing on the same code each land on a
    // different array element — Mongo's `$` positional operator resolves to
    // exactly one matching entry per update — so neither can silently
    // overwrite the other's claim or double up on the last seat. The same
    // single update is what stops one player's two devices racing to a seat
    // each: a read-then-claim would have both read "not seated yet". Shared
    // by the signed-in path below and the guest path, so a brand-new guest
    // id claims its seat through the identical query.
    const claimOpenSeat = (claimantId: string): Promise<IInvitationDataDocument | null> => InvitationModel.findOneAndUpdate(
        {
            ...openLobby,
            ...OPEN_SEAT_CLAIM_FILTER,
            ...notSeatedFilter(claimantId),
        },
        { $set: { "userIdList.$.userId": claimantId } },
        { new: true }
    ).exec();

    if (!userId) {
        // A signed-out visitor: for a guest, the join link isn't a
        // convenience, it's the whole flow — nobody types a code into a site
        // they've never heard of (docs/account-less-play.md §4/§14).
        const guestName = (name ?? '').trim();
        if (!isValidDisplayName(guestName)) {
            return NextResponse.json({}, { status: 400, statusText: "Invalid name" });
        }

        const lobby: IInvitationDataDocument | null = await InvitationModel.findOne(openLobby).exec();
        if (!lobby) {
            return NextResponse.json({}, { status: 404, statusText: "Lobby not found" });
        }
        if (openSeats(lobby).length === 0) {
            return NextResponse.json({}, { status: 409, statusText: "That lobby is full" });
        }

        // Suffix against everyone already seated — the host included, since
        // a guest could just as easily match them — so two "Dave"s in the
        // same lobby stay tellable apart (§5).
        const seatedIds = [lobby.senderId, ...lobby.userIdList.filter(entry => !isOpenSeat(entry)).map(entry => entry.userId)];
        const displayName = uniqueGuestName(guestName, await userIdListToUsernameList(seatedIds));

        const guest = await createGuest(displayName);
        const claimed = await claimOpenSeat(guest.userId);
        if (!claimed) {
            // Lost the race for the last seat between the read above and the
            // claim below — the guest account exists but has nowhere to sit,
            // so it doesn't outlive the request that made it (a billable
            // ghost with no lobby is exactly what the sweeper exists to stop).
            await deleteGuest(guest.userId);
            return NextResponse.json({}, { status: 409, statusText: "That lobby is full" });
        }

        // A brand-new guest id can't already hold a seat, so there's no
        // "already seated" branch to check here — straight to the same
        // accept-and-maybe-start sequence every other seat claim uses.
        const { gameStarted, gameId, gameUrl } = await acceptSeat(claimed, guest.userId);
        return NextResponse.json({
            success: true, gameStarted, gameId, gameUrl, inviteId: claimed.inviteId,
            // The client's one round trip through Clerk to turn this brand-new
            // guest into a signed-in session (`signIn.create({ strategy:
            // 'ticket', ticket })`) before it can even look at the lobby it
            // just joined.
            ticket: guest.ticket,
            // The resume fallback (docs/account-less-play.md §2/§15): shown
            // once, right after this response lands, so a guest who closes
            // the tab has a way back that isn't "hope this browser still has
            // the session cookie".
            resumeUrl: `${request.nextUrl.origin}${buildResumeHref(guest.resumeTicket)}`,
        });
    }

    const invite = await claimOpenSeat(userId);
    if (invite) {
        // The seat is claimed; run it through the same accept-and-maybe-start
        // sequence a named invitee's acceptance uses, so a lobby and a named
        // invite start through identical code.
        const { gameStarted, gameId, gameUrl } = await acceptSeat(invite, userId);

        // `inviteId` is for the seat-holder who is now waiting: it's the lobby
        // screen they wait on, alongside the host (GET /api/lobby/[inviteId]).
        return NextResponse.json({ success: true, gameStarted, gameId, gameUrl, inviteId: invite.inviteId });
    }

    // Nothing was claimed, and the three reasons are not the same answer, so
    // read the lobby back to tell them apart.
    const lobby: IInvitationDataDocument | null = await InvitationModel.findOne(openLobby).exec();
    if (!lobby) {
        return NextResponse.json({}, { status: 404, statusText: "Lobby not found" });
    }

    if (isSeatedAt(lobby, userId)) {
        // The player already has a place here — their other device, a second
        // go at the code, or the host scanning their own. A code is a way in,
        // not a way to a second seat, so send them to the seat they hold.
        // If that seat is a named invite still waiting on them, entering the
        // code is as good an acceptance as tapping accept on the dashboard —
        // otherwise they'd sit on the lobby screen watching a game their own
        // unaccepted seat is blocking.
        const started = pendingSeatFor(lobby, userId) ? await acceptSeat(lobby, userId) : { gameStarted: false };
        return NextResponse.json({ success: true, alreadySeated: true, ...started, inviteId: lobby.inviteId });
    }

    // A live lobby, but every seat in it is taken.
    return NextResponse.json({}, { status: 409, statusText: "That lobby is full" });
}
