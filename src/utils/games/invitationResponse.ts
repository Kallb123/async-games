import { IInvitationDataDocument, IInvitationResponse } from "@/utils/mongodb/InvitationData";
import { UserDirectory } from "@/utils/users/clerk";
import { isOpenSeat, OPEN_SEAT_LABEL } from "@/utils/games/lobby";

/**
 * Every id an invitation needs a name or a picture for: its sender, and whoever
 * holds a real seat. Open seats are left out — OPEN_SEAT_ID is not a Clerk id,
 * and they render as a placeholder rather than a person.
 *
 * Paired with `invitationToResponse`, so a screen showing several invitations
 * can resolve all of them in one Clerk call (see UserDirectory).
 */
export function invitationUserIds(invite: IInvitationDataDocument): string[] {
    return [
        invite.senderId,
        ...invite.userIdList.filter(entry => !isOpenSeat(entry)).map(entry => entry.userId)
    ];
}

// Shared by the dashboard and the lobby, so there is one way to describe an
// invitation however it is being looked at.
export function invitationToResponse(
    invite: IInvitationDataDocument,
    directory: UserDirectory
): IInvitationResponse {
    // Zip the resolved names back onto their original positions so the open-seat
    // placeholders don't shift anyone else's name out of alignment (the same
    // hazard §5 of the design doc fixed for userIdListToUsernameList itself).
    const userList = invite.userIdList.map(entry =>
        isOpenSeat(entry) ? OPEN_SEAT_LABEL : directory.name(entry.userId)
    );

    return {
        timestamp: invite.timestamp,
        inviteId: invite.inviteId,
        sender: directory.name(invite.senderId),
        senderImageUrl: directory.imageUrl(invite.senderId),
        userList,
        gameFriendlyName: invite.gameFriendlyName,
        joinCode: invite.joinCode,
        expiresAt: invite.expiresAt?.toISOString()
    };
}
