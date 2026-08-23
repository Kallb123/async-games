import { clerkClient } from "@clerk/nextjs/server";
import { IInvitationDataDocument, IInvitationResponse } from "@/utils/mongodb/InvitationData";
import { userIdListToUsernameList } from "@/utils/users/clerk";
import { profileImageUrl } from "@/utils/ui/avatar";
import { isOpenSeat } from "@/utils/games/lobby";

// What an unclaimed seat renders as in an invite list. The client needs no
// change for this: IInvitationResponse.userList is already a list of display
// strings, so a lobby's placeholder seats slot in as one more value in it.
export const OPEN_SEAT_LABEL = "Open seat";

// Shared by /api/user/incominginvites and /api/user/outgoinginvites, which
// were otherwise byte-for-byte identical but for their find() filter.
export async function invitationToResponse(invite: IInvitationDataDocument): Promise<IInvitationResponse> {
    const senderUser = await (await clerkClient()).users.getUser(invite.senderId);

    // Resolve real seats through Clerk and leave open seats out of that
    // lookup entirely — OPEN_SEAT_ID isn't a Clerk id, so it would otherwise
    // just fall back to UNKNOWN_PLAYER_NAME. Zip the resolved names back onto
    // their original positions so the placeholders don't shift anyone else's
    // name out of alignment (the same hazard §5 of the design doc fixed for
    // userIdListToUsernameList itself).
    const realUserIds = invite.userIdList.filter(entry => !isOpenSeat(entry)).map(entry => entry.userId);
    const realUsernames = await userIdListToUsernameList(realUserIds);
    let nextRealUsername = 0;
    const userList = invite.userIdList.map(entry =>
        isOpenSeat(entry) ? OPEN_SEAT_LABEL : realUsernames[nextRealUsername++]
    );

    return {
        timestamp: invite.timestamp,
        inviteId: invite.inviteId,
        sender: senderUser.username ?? "Unknown User",
        senderImageUrl: profileImageUrl(senderUser),
        userList,
        gameFriendlyName: invite.gameFriendlyName
    };
}
