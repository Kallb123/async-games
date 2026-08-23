import { IInvitationData, IUserIdAcceptance } from "@/utils/mongodb/InvitationData";

// The userId every unclaimed seat carries — never a real Clerk id, so
// isOpenSeat can never mistake a filled seat for one still open. A lobby is
// an Invitation with some of these placeholder entries in userIdList rather
// than a separate open-seats counter (see docs/account-less-play.md §4).
export const OPEN_SEAT_ID = "open-seat";

// What an unclaimed seat renders as in an invite list. Lives here (a pure,
// client-safe module) rather than in invitationResponse.ts, which imports
// server-only Clerk code — the host's lobby screen needs to tell an open seat
// apart from a claimed one without pulling that into the client bundle.
export const OPEN_SEAT_LABEL = "Open seat";

// How long an open lobby lives before its TTL index reaps it (see the
// `expiresAt` index on InvitationSchema, and docs/account-less-play.md §4) —
// long enough for a host's friends to type in a code, short enough that a
// code nobody used stops working and frees itself back into the pool.
export const LOBBY_TTL_MS = 60 * 60 * 1000;

export function isOpenSeat(entry: IUserIdAcceptance): boolean {
    return entry.userId === OPEN_SEAT_ID;
}

export function openSeats(invite: Pick<IInvitationData, "userIdList">): IUserIdAcceptance[] {
    return invite.userIdList.filter(isOpenSeat);
}

// The Mongo query fragment that matches an unclaimed seat, for the atomic
// claim a lobby join needs (combine with the invitation's own id filter, then
// findOneAndUpdate): the `$` positional operator resolves "userIdList.userId"
// to exactly one matching array element, so concurrent claims never collide
// even though every open seat carries the same placeholder id.
export const OPEN_SEAT_CLAIM_FILTER = { "userIdList.userId": OPEN_SEAT_ID };
