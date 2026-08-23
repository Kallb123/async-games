import { User, clerkClient } from '@clerk/nextjs/server';
import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { userListToUserIdNameMap } from '@/utils/users/clerk';
import { IInvitationDataDocument } from '@/utils/mongodb/InvitationData';
import { IGameData } from '@/utils/mongodb/GameData';
import { gameDataModelFor } from '@/utils/mongodb/mongodb';
import { uuidString } from '@/utils/apiModels/GameDataApi';

/**
 * Turn an invitation into a live game: build the game document for the
 * invitation's game type, save it, delete the invitation and tell everyone the
 * game has started.
 *
 * This is the one place a game comes into existence from an invitation, so
 * every route that can start a game shares a single start path.
 *
 * @param invite   the invitation to convert — deleted once the game is saved
 * @param actorId  whoever triggered the start. They don't get the opening
 *                 "your turn" push even if they're first to play: they're
 *                 looking at the app right now
 * @param userList every invitee plus the sender, already resolved by the
 *                 caller (which needs them for its own pushes)
 * @returns the newly created game's data
 */
export async function startGameFromInvitation(
    invite: IInvitationDataDocument,
    actorId: string,
    userList: User[]
): Promise<IGameData> {
    const userIdList = invite.userIdList.map(uid => uid.userId);
    const gameData = await invite.CreateGame(invite, userIdList.concat(invite.senderId));

    // One lookup instead of a branch per game: the models come from the same
    // typed record Mongoose's discriminators are registered from, so a new game
    // needs no line here at all.
    const gameDataModel = gameDataModelFor(invite.gameType);
    if (!gameDataModel) {
        throw new Error(`Unsupported game type: ${invite.gameType}`);
    }
    // Stamp the lobby/invitation it came from onto the game, so a host still
    // sitting on their lobby screen when the last seat fills can find the game
    // their lobby just became — the invitation is deleted a line below, and
    // nothing else links the two.
    await new gameDataModel({ ...gameData, inviteId: invite.inviteId }).save();

    await invite.deleteOne();

    await sendPushToUsers(userList, {
        event: 'GameStart',
        inviteId: invite.inviteId,
        gameId: gameData.gameId.toString() as uuidString
    });

    // Whoever won the roll for turn order is up immediately, and until now nothing
    // told them so — the first "your move" push only went out once someone had
    // played. Skip it for the player who triggered the game starting: they're
    // looking at the app right now (and for solo games they're the only player).
    const firstUser = userList.find(u => u.id === gameData.currentTurn);
    if (firstUser && firstUser.id !== actorId) {
        await sendPushToUsers([firstUser], {
            event: 'YourTurn',
            gameId: gameData.gameId.toString() as uuidString,
            link: gameNotificationLink(gameData.gameType.url, gameData.gameId.toString())
        }, await buildYourTurnNotification(gameData, firstUser.id, userListToUserIdNameMap(userList), {
            gameJustStarted: true
        }), {
            channel: 'yourTurn'
        });
    }

    return gameData;
}

export interface AcceptSeatResult {
    gameStarted: boolean;
    gameId?: uuidString;
    gameUrl?: string;
}

/**
 * Accept a seat on an invitation - a named invitee accepting, or (from step
 * 8 on) a guest claiming an open lobby seat - and start the game if that
 * acceptance was the last one needed.
 *
 * This is the accept-and-maybe-start sequence /api/invite/accept already
 * ran inline: flip this seat's acceptance, resolve the roster (every
 * invitee plus the sender, for their pushes and dashboards), push
 * InviteAccepted, and call startGameFromInvitation once every seat has
 * accepted. The lobby's join and start-now routes need the identical
 * sequence, so it lives here rather than being copied a second and third
 * time.
 *
 * @param invite  the invitation to accept a seat on
 * @param actorId whoever is accepting, matched against userIdList
 */
export async function acceptSeat(
    invite: IInvitationDataDocument,
    actorId: string
): Promise<AcceptSeatResult> {
    const acceptance = invite.userIdList.find(uid => uid.userId === actorId);
    if (acceptance) {
        acceptance.inviteAccepted = true;
    }

    const userIdList = invite.userIdList.map(uid => uid.userId);
    // Notify every invitee *and* the original sender: the sender's outgoing-invite
    // list / home dashboard needs to react live when their invite is accepted and
    // when the game finally starts.
    const { data: userList } = await (await clerkClient()).users.getUserList({
        userId: [...userIdList, invite.senderId]
    });

    const allAccepted = invite.userIdList.every(uid => uid.inviteAccepted === true);
    if (!allAccepted) {
        await invite.save();
    }

    await sendPushToUsers(userList, {
        event: 'InviteAccepted',
        inviteId: invite.inviteId
    });

    if (!allAccepted) {
        return { gameStarted: false };
    }

    const gameData = await startGameFromInvitation(invite, actorId, userList);

    return { gameStarted: true, gameId: gameData.gameId, gameUrl: gameData.gameType.url };
}
