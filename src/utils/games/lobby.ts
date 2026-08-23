import { IInvitationData, IUserIdAcceptance } from "@/utils/mongodb/InvitationData";

// The userId every unclaimed seat carries — never a real Clerk id, so
// isOpenSeat can never mistake a filled seat for one still open. A lobby is
// an Invitation with some of these placeholder entries in userIdList rather
// than a separate open-seats counter (see docs/account-less-play.md §4).
export const OPEN_SEAT_ID = "open-seat";

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
