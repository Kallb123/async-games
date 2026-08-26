import { NextRequest, NextResponse } from 'next/server';
import { User, auth, currentUser } from '@clerk/nextjs/server';
import { canHostGame, usersByUsername } from '@/utils/users/clerk';
import { isValidTurnTimer } from '@/utils/games/TurnTimer';
import { readJsonBody, readUsernameList } from '@/utils/api/requestBody';
import type { IInvitationRequest } from '@/utils/mongodb/InvitationData';

/**
 * The signed-in host of a game about to be created, or the response to answer
 * the request with.
 *
 * Callers do `if ('error' in host) return host.error;` and carry on.
 */
export type GameHost =
    | { error: NextResponse }
    | { userId: string, host: User };

/**
 * Establishes that whoever is asking may open a game: signed in, resolvable,
 * and a real registered account rather than a guest (`canHostGame` —
 * docs/account-less-play.md §8).
 *
 * The same eleven lines opened all eight game-creation routes.
 */
export async function requireGameHost(): Promise<GameHost> {
    const { userId } = await auth();
    if (!userId) {
        return { error: NextResponse.json({}, { status: 400, statusText: "Not signed in" }) };
    }
    const host = await currentUser();
    if (!host) {
        return { error: NextResponse.json({}, { status: 400, statusText: "Not signed in" }) };
    }
    // Every lobby needs a real, registered host — see canHostGame's own
    // comment (docs/account-less-play.md §8).
    if (!canHostGame(host)) {
        return { error: NextResponse.json({}, { status: 403, statusText: "Account not unlocked" }) };
    }
    return { userId, host };
}

export type GameSetupRequest<T> =
    | { error: NextResponse }
    | {
        /** The parsed body, still `Partial` — a claim, not a guarantee. Each
         *  route reads its own game-specific settings off this and checks
         *  them, the way Solitaire checks its `drawMode`. */
        body: Partial<T>,
        userId: string,
        host: User,
        /** The invitees, resolved and confirmed to all exist. Never includes
         *  the host, who is the invitation's `senderId`. */
        invitees: User[],
        /** Validated against the turn-timer ladder, so it is safe to store. */
        turnTimer: string,
    };

/**
 * Everything the seven `/api/newgame/*` routes established before they could
 * write anything, done once.
 *
 * The prologue was identical in all of them and differed only in the local
 * variable name: sign in, resolve the user, `canHostGame`, read the invitee
 * usernames, resolve them against Clerk, confirm every one of them existed,
 * and check the turn timer. A change to any of it — the two validations added
 * with this helper, for instance — meant seven edits, and a new game meant
 * copying the block an eighth time.
 *
 * What stays in each route is the part that is genuinely per-game: its party
 * size rule, its own settings, and the invitation it builds.
 */
export async function readGameSetupRequest<T extends IInvitationRequest>(
    request: NextRequest
): Promise<GameSetupRequest<T>> {
    const body = await readJsonBody<T>(request);

    const host = await requireGameHost();
    if ('error' in host) {
        return host;
    }

    const usernames = readUsernameList(body.userList);
    if (!usernames) {
        return { error: NextResponse.json({}, { status: 400, statusText: "Invalid player list" }) };
    }

    // Via usersByUsername, so a game invited nobody looks up nobody rather
    // than having Clerk hand back its entire user list.
    const invitees = await usersByUsername(usernames);
    if (invitees.length !== usernames.length) {
        return { error: NextResponse.json({}, { status: 404, statusText: "User not found" }) };
    }

    // A turn timer the app can't count is a game that expires on the timer
    // cron's first pass — see isValidTurnTimer.
    if (!isValidTurnTimer(body.turnTimer)) {
        return { error: NextResponse.json({}, { status: 400, statusText: "Unknown turn timer" }) };
    }

    return { body, userId: host.userId, host: host.host, invitees, turnTimer: body.turnTimer };
}

/** The `userIdList` an invitation is created with: every invitee, none of them
 *  having accepted yet. The host isn't in it — they're the `senderId`. */
export function seatsFor(invitees: User[]) {
    return invitees.map(user => ({ userId: user.id, inviteAccepted: false }));
}
