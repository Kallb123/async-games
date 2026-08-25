import { User } from '@clerk/nextjs/server';
import { readableName } from '@/utils/ui/players';
import { buildGameInviteNotification } from './notificationContent';
import { homeNotificationLink, sendPushToUsers } from './pushNotification';

/**
 * "<Someone> challenged you to <game>" — the push every route that creates an
 * invitation sends, and the only push any of them sends.
 *
 * Seven routes do this: one per game a player can set up, plus the lobby. They
 * had seven copies of the same six lines, which is seven places to forget the
 * channel or the link the next time a game is added. It lives here instead, in
 * its own module rather than beside `sendPushToUsers`, because the copy comes
 * from `notificationContent` and that already imports from there.
 */
export async function sendGameInvitePush(
    invitedUsers: User[],
    sender: User,
    invite: { inviteId: string; gameFriendlyName: string }
) {
    await sendPushToUsers(invitedUsers, {
        event: "NewInvite",
        inviteId: invite.inviteId,
        link: homeNotificationLink()
    }, buildGameInviteNotification(readableName(sender), invite.gameFriendlyName), {
        channel: 'gameInvite'
    });
}
