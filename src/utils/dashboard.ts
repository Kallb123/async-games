import { GAME_SUMMARY_PROJECTION, GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { GameResultModel, IGameResultDataDocument } from '@/utils/mongodb/GameResultData';
import { IInvitationDataDocument, InvitationModel, IInvitationResponse } from '@/utils/mongodb/InvitationData';
import { ChatMessageModel } from '@/utils/mongodb/ChatMessageData';
import { ChatReadModel, IChatReadDataDocument } from '@/utils/mongodb/ChatReadData';
import { invitationToResponse, invitationUserIds } from '@/utils/games/invitationResponse';
import { buildUserDirectory, UserDirectory } from '@/utils/users/clerk';
import { untimed, type TimeSpan } from '@/utils/api/serverTiming';
import { GAME_META } from '@/utils/ui/games';
import { DASHBOARD_COMPLETED_LIMIT } from '@/utils/apiModels/GameDataApi';
import type { ICompletedGame, IDashboardResponse, IGameResponse } from '@/utils/apiModels/GameDataApi';
import { worldSummaries } from '@/games/KingdomBuilder';
import { worldIdOfInvitation } from '@/games/KingdomBuilder/worldInvitation';

/**
 * The fields of a finished game the home screen and the full-history page read:
 * `toCompletedGames` and `completedGameUserIds` below, and nothing else. A
 * result carries its per-game `stats` and charts' worth of numbers, which a row
 * that says who won never touches. Kept beside the two readers so a field added
 * to one is added here.
 */
const COMPLETED_GAME_PROJECTION = {
    gameId: 1, url: 1, winner: 1, endReason: 1, endDetail: 1, forfeitedBy: 1, endedAt: 1,
} as const;

/**
 * Finished games, newest first. Also served on its own to the full-history page,
 * which passes no `limit` and gets every one; the home screen passes one so the
 * read stops at what it can show instead of growing with a player's history.
 * The `{ playerIds, endedAt: -1 }` index on GameResult serves the filter and the
 * sort together, so a limited read stops early rather than sorting them all.
 */
export function completedGameResults(userId: string, limit?: number): Promise<IGameResultDataDocument[]> {
    const query = GameResultModel.find({ playerIds: userId }, COMPLETED_GAME_PROJECTION).sort({ endedAt: -1 });
    return (limit ? query.limit(limit) : query).exec();
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

async function kingdomBuilderWorlds(userId: string) {
    try {
        return await worldSummaries(userId);
    } catch (error) {
        console.error(`Failed to read Kingdom Builder worlds for user ${userId}`, error);
        return [];
    }
}

function withUnreadChat(response: IGameResponse, counts: Map<string, number>): IGameResponse {
    return { ...response, unreadChatCount: counts.get(response.gameId) ?? 0 };
}

/**
 * Whether this is a Kingdom Builder world invitation the player has already
 * accepted — which, for a world, means they are in it. The world's own row in
 * `worlds` is how they get back to it; the invitation stays open for the
 * seats still to fill, and would otherwise sit in "Invites" as a spent ✓ for
 * the rest of its life.
 */
function hasJoinedWorld(invite: IInvitationDataDocument, userId: string): boolean {
    return !!worldIdOfInvitation(invite) && invite.userIdList.some(seat => seat.userId === userId && seat.inviteAccepted);
}

/**
 * Everything the home screen shows, read as one snapshot.
 *
 * The five lists used to be five endpoints, each fetched and polled by its own
 * component. Two problems with that, and the second is the expensive one:
 *
 *  - Five independent reads are five different moments. A game starting moves
 *    an invitation out of "Awaiting response" and into a turn list, and with
 *    separate reads a player could see it in neither — or in both.
 *  - Every game and every invitation resolved its own players, so rendering
 *    one dashboard took twenty-odd round trips to Clerk. Reading the lot
 *    together means one lookup for the union of every name on screen (and the
 *    directory cache answers most of that from memory).
 */
export async function buildDashboard(userId: string, time: TimeSpan = untimed): Promise<IDashboardResponse> {
    // Three reads, then partitioned here. "My turn" and "their turn" were two
    // Mongo queries over the same set of games, and the two invite lists two
    // over the same set of invitations — splitting in memory is both cheaper
    // and the thing that makes the snapshot consistent.
    const [games, invites, results] = await time('mongo_query', () => Promise.all([
        // A game that dropped this player for going quiet carries on without
        // them; it is theirs again, as a loss, once it finishes.
        // Projected to what a summary row reads (see GAME_SUMMARY_PROJECTION):
        // not the move history, not any game's own state. The filter may name
        // fields the projection leaves out.
        GameDataModel.find(
            { userIdList: userId, complete: false, 'gameState.droppedPlayers': { $ne: userId } },
            GAME_SUMMARY_PROJECTION,
        ).exec() as Promise<IGameDataDocument[]>,
        InvitationModel.find({
            $or: [{ senderId: userId }, { "userIdList.userId": userId }]
        }).exec() as Promise<IInvitationDataDocument[]>,
        // One more than the screen shows: the extra row is how it knows to
        // offer "See all" without counting every game a player has finished.
        completedGameResults(userId, DASHBOARD_COMPLETED_LIMIT + 1),
    ]));

    // A game names its winner and forfeiter from its own player list, so its
    // seats are the whole of what it needs resolved.
    const directory = await time('player_directory', () => buildUserDirectory([
        ...games.flatMap(game => game.userIdList),
        ...invites.flatMap(invitationUserIds),
        ...completedGameUserIds(results),
    ]));

    const invitations = invites.map(invite => ({
        invite,
        response: invitationToResponse(invite, directory)
    }));

    // Read separately from the Promise.all above, deliberately: a failure
    // here must not cost the turn lists and invitations that read just fine
    // (see unreadChatCounts). Each is its own span, so a slow one is named
    // rather than lost between `player_directory` and `response_build`; they
    // swallow their own failures, so the span closes either way.
    const [unreadCounts, worlds] = await Promise.all([
        time('unread_chat', () => unreadChatCounts(userId, games)),
        time('kb_worlds', () => kingdomBuilderWorlds(userId)),
    ]);

    return time('response_build', async () => ({
        worlds,
        myTurn: games.filter(game => game.currentTurn === userId).map(game => withUnreadChat(game.CreateResponse(directory), unreadCounts)),
        theirTurn: games.filter(game => game.currentTurn !== userId).map(game => withUnreadChat(game.CreateResponse(directory), unreadCounts)),
        incoming: invitations.filter(({ invite }) => invite.senderId !== userId && !hasJoinedWorld(invite, userId)).map(({ response }) => response),
        outgoing: invitations.filter(({ invite }) => invite.senderId === userId).map(({ response }) => response),
        completed: toCompletedGames(results, directory),
    }));
}
