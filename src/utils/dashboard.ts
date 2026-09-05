import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { GameResultModel, IGameResultDataDocument } from '@/utils/mongodb/GameResultData';
import { IInvitationDataDocument, InvitationModel, IInvitationResponse } from '@/utils/mongodb/InvitationData';
import { ChatMessageModel } from '@/utils/mongodb/ChatMessageData';
import { ChatReadModel, IChatReadDataDocument } from '@/utils/mongodb/ChatReadData';
import { invitationToResponse, invitationUserIds } from '@/utils/games/invitationResponse';
import { buildUserDirectory, UserDirectory } from '@/utils/users/clerk';
import { GAME_META } from '@/utils/ui/games';
import type { ICompletedGame, IDashboardResponse, IGameResponse } from '@/utils/apiModels/GameDataApi';

/**
 * Everything the home screen shows, read as one snapshot.
 *
 * The five lists used to be five endpoints, each fetched and polled by its own
 * component. Two problems with that, and the second is the expensive one:
 *
 *  - Five independent reads are five different moments. A game starting moves
 *    an invitation out of "Awaiting response" and into a turn list, and with
 *    separate reads a player could see it in neither — or in both.
 *  - Nothing caches Clerk. Every game and every invitation resolved its own
 *    players, so rendering one dashboard took twenty-odd round trips. Reading
 *    the lot together means one call for the union of every name on screen.
 */
/** Finished games, newest first. Also served on its own to the full-history page. */
export function completedGameResults(userId: string): Promise<IGameResultDataDocument[]> {
    return GameResultModel.find({ playerIds: userId }).sort({ endedAt: -1 }).exec();
}

/** The ids a finished game names — only ever a winner and a forfeiter. */
export function completedGameUserIds(results: IGameResultDataDocument[]): string[] {
    return results.flatMap(result => [result.winner, result.forfeitedBy]).filter(Boolean) as string[];
}

export function toCompletedGames(results: IGameResultDataDocument[], directory: UserDirectory): ICompletedGame[] {
    return results.map(result => ({
        gameId: result.gameId,
        url: result.url,
        friendlyName: GAME_META[result.url]?.name ?? result.url,
        winner: directory.name(result.winner),
        winnerId: result.winner || undefined,
        endReason: result.endReason,
        endDetail: result.endDetail,
        forfeitedBy: result.forfeitedBy ? directory.name(result.forfeitedBy) : undefined,
        endedAt: result.endedAt,
    }));
}

/**
 * How many chat messages this player hasn't read yet, per live game — the
 * answer to docs/in-game-chat.md §7's open gap: a player who has muted the
 * `chat` channel now learns there is something to read without opening the
 * game. See §13.5 for why this is a second round trip rather than a fourth
 * member of the game/invite/result `Promise.all`: it needs the game list to
 * build one `$or` clause per game, so it can only run once that is in hand.
 *
 * A live game is a handful, per §13.5, but nothing caps it — a player with an
 * unusually large number open sends a correspondingly large `$or`, still
 * served index-only per clause. Reads its own marker collection rather than
 * one shared by the caller, and swallows any failure to an empty map: chat
 * only decorates this response, so a Mongo hiccup on either of its two
 * collections should cost a wrong badge, not the whole dashboard — the turn
 * lists and invites already read successfully by the time this runs.
 */
async function unreadChatCounts(userId: string, games: IGameDataDocument[]): Promise<Map<string, number>> {
    if (games.length === 0) {
        return new Map();
    }

    try {
        const markers = await ChatReadModel.find({ userId }).exec() as IChatReadDataDocument[];
        const readAt = new Map(markers.map(marker => [marker.gameId, marker.readAt]));

        // One $or clause per live game, each served by the { gameId: 1,
        // timestamp: -1 } index ChatMessageData already has — this reads index
        // entries, not documents. A game with no marker counts every message
        // from somebody else, the same first-time signal the board's own dot
        // gives; `senderId: { $ne: userId }` is why a player never has unread
        // mail from themselves.
        const rows = await ChatMessageModel.aggregate([
            { $match: { $or: games.map(game => ({
                gameId: game.gameId,
                senderId: { $ne: userId },
                ...(readAt.has(game.gameId) ? { timestamp: { $gt: readAt.get(game.gameId) } } : {}),
            })) } },
            { $group: { _id: '$gameId', count: { $sum: 1 } } },
        ]) as { _id: string, count: number }[];

        return new Map(rows.map(row => [row._id, row.count]));
    } catch (error) {
        console.error(`Failed to read unread chat counts for user ${userId}`, error);
        return new Map();
    }
}

function withUnreadChat(response: IGameResponse, counts: Map<string, number>): IGameResponse {
    return { ...response, unreadChatCount: counts.get(response.gameId) ?? 0 };
}

export async function buildDashboard(userId: string): Promise<IDashboardResponse> {
    // Three reads, then partitioned here. "My turn" and "their turn" were two
    // Mongo queries over the same set of games, and the two invite lists two
    // over the same set of invitations — splitting in memory is both cheaper
    // and the thing that makes the snapshot consistent.
    const [games, invites, results] = await Promise.all([
        GameDataModel.find({ userIdList: userId, complete: false }).exec() as Promise<IGameDataDocument[]>,
        InvitationModel.find({
            $or: [{ senderId: userId }, { "userIdList.userId": userId }]
        }).exec() as Promise<IInvitationDataDocument[]>,
        completedGameResults(userId),
    ]);

    // A game names its winner and forfeiter from its own player list, so its
    // seats are the whole of what it needs resolved.
    const directory = await buildUserDirectory([
        ...games.flatMap(game => game.userIdList),
        ...invites.flatMap(invitationUserIds),
        ...completedGameUserIds(results),
    ]);

    const invitations = invites.map(invite => ({
        invite,
        response: invitationToResponse(invite, directory)
    }));

    // Read separately from the Promise.all above, deliberately: a failure
    // here must not cost the turn lists and invitations that read just fine
    // (see unreadChatCounts).
    const unreadCounts = await unreadChatCounts(userId, games);

    return {
        myTurn: games.filter(game => game.currentTurn === userId).map(game => withUnreadChat(game.CreateResponse(directory), unreadCounts)),
        theirTurn: games.filter(game => game.currentTurn !== userId).map(game => withUnreadChat(game.CreateResponse(directory), unreadCounts)),
        incoming: invitations.filter(({ invite }) => invite.senderId !== userId).map(({ response }) => response),
        outgoing: invitations.filter(({ invite }) => invite.senderId === userId).map(({ response }) => response),
        completed: toCompletedGames(results, directory),
    };
}
