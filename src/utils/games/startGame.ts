import { User } from '@clerk/nextjs/server';
import { sendPushToUsers, gameNotificationLink } from '@/utils/firebase/pushNotification';
import { buildYourTurnNotification } from '@/utils/firebase/notificationContent';
import { userListToUserIdNameMap, usersById } from '@/utils/users/clerk';
import mongoose from 'mongoose';
import { IInvitationDataDocument, InvitationModel } from '@/utils/mongodb/InvitationData';
import { GameDataModel, IGameData, IGameDataDocument } from '@/utils/mongodb/GameData';
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
 * @param invite   the invitation to convert — consumed once the game is saved
 * @param actorId  whoever triggered the start. They don't get the opening
 *                 "your turn" push even if they're first to play: they're
 *                 looking at the app right now
 * @param userList every invitee plus the sender, already resolved by the
 *                 caller (which needs them for its own pushes)
 * @returns the newly created game's data, or null if another request consumed
 *          the invitation first — see the transaction below
 */
export async function startGameFromInvitation(
    invite: IInvitationDataDocument,
    actorId: string,
    userList: User[]
): Promise<IGameData | null> {
    const userIdList = invite.userIdList.map(uid => uid.userId);
    const gameData = await invite.CreateGame(invite, userIdList.concat(invite.senderId));

    // One lookup instead of a branch per game: the models come from the same
    // typed record Mongoose's discriminators are registered from, so a new game
    // needs no line here at all.
    const gameDataModel = gameDataModelFor(invite.gameType);
    if (!gameDataModel) {
        throw new Error(`Unsupported game type: ${invite.gameType}`);
    }
    // Creating the game and consuming the invitation are one change across two
    // collections, so they go in one transaction — the only place in the app
    // that needs one (everywhere else, a single document is the whole unit of
    // consistency). Without it the two writes fail apart in both directions:
    // a save that lands and a delete that doesn't leaves the invitation
    // startable a second time, and two requests that both pass the
    // all-accepted check in acceptSeat both create a game from it.
    //
    // The delete goes first and is the gate. Exactly one transaction can
    // remove the invitation — a second racing it conflicts on the same
    // document and retries, finds it gone, and starts nothing — so "who gets
    // to turn this invitation into a game" is decided by a write rather than
    // by a read that another request can duplicate.
    //
    // gameData is built above and stamped with the invitation it came from, so
    // a host still sitting on their lobby screen when the last seat fills can
    // find the game their lobby just became (GET /api/lobby/[inviteId]/game);
    // nothing else links the two once the invitation is gone. The document is
    // constructed inside the callback because withTransaction re-runs it on a
    // transient conflict, and a Mongoose document only saves as an insert once.
    const started: boolean = await mongoose.connection.transaction(async session => {
        const { deletedCount } = await InvitationModel.deleteOne({ inviteId: invite.inviteId }, { session });
        if (deletedCount === 0) {
            return false;
        }
        await new gameDataModel({ ...gameData, inviteId: invite.inviteId }).save({ session });
        return true;
    });

    if (!started) {
        return null;
    }

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
 * ran inline: flip this seat's acceptance, resolve the roster (every invitee
 * plus the sender), and call startGameFromInvitation once every seat has
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
    // One conditional update, not the read-modify-write this used to be: the
    // seat flips and the current invitation comes back in the same round trip,
    // so the all-accepted check below reads what is in the database rather than
    // the copy this request happened to fetch. Two invitees accepting at the
    // same moment each used to see only their own acceptance, so neither
    // started the game and the invitation was left fully accepted with nothing
    // able to act on it again — a named invite has no expiry, so that was
    // permanent.
    //
    // arrayFilters rather than the positional `$` operator because the actor
    // does not always hold a seat: a host starting their own lobby is its
    // senderId, not a userIdList entry, and a `$`-positional filter would match
    // no document at all for them. An arrayFilter matching nothing updates
    // nothing and still returns the invitation, which is exactly the host case.
    const current: IInvitationDataDocument | null = await InvitationModel.findOneAndUpdate(
        { inviteId: invite.inviteId },
        { $set: { "userIdList.$[seat].inviteAccepted": true } },
        { arrayFilters: [{ "seat.userId": actorId }], new: true }
    ).exec();
    if (!current) {
        // Gone between the caller reading it and this update: cancelled, or
        // already turned into a game by a request that raced this one.
        return gameStartedFrom(invite.inviteId);
    }

    const userIdList = current.userIdList.map(uid => uid.userId);
    // Every invitee *and* the original sender, because that is the party
    // `startGameFromInvitation` needs below — to pick whoever moves first, and
    // to put the other players' names in their opening push.
    const userList = await usersById([...userIdList, current.senderId]);

    const allAccepted = current.userIdList.every(uid => uid.inviteAccepted === true);
    if (!allAccepted) {
        return { gameStarted: false };
    }

    const gameData = await startGameFromInvitation(current, actorId, userList);
    return gameData ? startedResult(gameData) : gameStartedFrom(current.inviteId);
}

// Where an AcceptSeatResult gets the game it is pointing at. Both ways of
// arriving at a started game — this request started it, or it found the one
// another request started — answer with the same fields, so they read them off
// the game in one place.
function startedResult(gameData: IGameData): AcceptSeatResult {
    return { gameStarted: true, gameId: gameData.gameId, gameUrl: gameData.gameType.url };
}

// The game an invitation became, for a request that didn't get to start it
// itself — another one did, in the window between this request reading the
// invitation and acting on it. The invitation is gone by then, and `inviteId`
// is the only link left to the game it became: the same one the lobby screen
// polls on (GET /api/lobby/[inviteId]/game). Reporting the game the winning
// request created beats reporting that nothing started, since something did.
async function gameStartedFrom(inviteId: uuidString): Promise<AcceptSeatResult> {
    const gameData: IGameDataDocument | null = await GameDataModel.findOne({ inviteId }).exec();
    return gameData ? startedResult(gameData) : { gameStarted: false };
}
