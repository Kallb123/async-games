import { IInvitationData, IUserIdAcceptance } from "@/utils/mongodb/InvitationData";
import { pluralize } from "@/utils/ui/text";

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

// Whether this id already has a place at the lobby: the host (who holds no
// seat of their own — they're the invitation's sender) or any seat already
// carrying their id, named or claimed. The readable half of notSeatedFilter
// below, for deciding what a refused claim meant.
export function isSeatedAt(
    invite: Pick<IInvitationData, "senderId" | "userIdList">,
    claimantId: string
): boolean {
    return invite.senderId === claimantId
        || invite.userIdList.some(entry => entry.userId === claimantId);
}

// The other half of the atomic claim: one principal, one seat. A code-holder
// signed in on a second device is the same player, so a lobby they already
// have a place at must not hand them a second seat — the game would deal them
// two turns and every other player would be short one. Combine with
// OPEN_SEAT_CLAIM_FILTER, so the claim can only land on a lobby that has a
// seat going *and* isn't already theirs.
//
// The claimant's own id is excluded with an `$expr` rather than a second
// `"userIdList.userId"` condition on purpose: the claim's `$set` writes through
// the positional `$` operator, which resolves to the array element the *query*
// matched, and a second predicate on that same path would leave which seat
// gets written ambiguous. An `$expr` is not a path predicate, so
// OPEN_SEAT_CLAIM_FILTER stays the only thing `$` can resolve from.
export function notSeatedFilter(claimantId: string) {
    return {
        senderId: { $ne: claimantId },
        $expr: { $not: [{ $in: [claimantId, "$userIdList.userId"] }] },
    };
}

// The seat this id holds at the lobby but hasn't accepted yet, if any — a
// named invitee who was sent an invite and hasn't answered it. Beside
// isSeatedAt rather than inline in the join route so all three phrasings of
// "does this player already have a place here?" live together and move
// together.
export function pendingSeatFor(
    invite: Pick<IInvitationData, "userIdList">,
    claimantId: string
): IUserIdAcceptance | undefined {
    return invite.userIdList.find(entry => entry.userId === claimantId && !entry.inviteAccepted);
}

// The two sentences a lobby is described in, wherever someone is being invited
// into it: on `/join`'s guest screen, in the link preview a shared join link
// unfurls to, and on the share card that preview draws. Written once so the
// three never drift into three different ways of saying the same thing.
export function seatsLeftLabel(openSeatCount: number): string {
    return `${pluralize(openSeatCount, 'seat')} left`;
}

// What a lobby's remaining room is worth saying to someone who hasn't taken a
// seat yet — the same call to action on the guest screen's link preview and on
// the card that preview draws, rather than two ternaries drifting apart.
export function seatsCta(openSeatCount: number): string {
    return openSeatCount > 0
        ? `${seatsLeftLabel(openSeatCount)} — tap to take one`
        : "Every seat in this one is taken";
}

// Exported apart from the sentence below because the share card sets the two
// halves at two sizes — the game's name is the big word on it — and would
// otherwise be spelling the phrase out a second time.
export const INVITED_YOU_TO = 'invited you to';

export function invitedYouTo(sender: string, gameFriendlyName: string): string {
    return `${sender} ${INVITED_YOU_TO} ${gameFriendlyName}`;
}
