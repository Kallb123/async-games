import { GameDataModel, IGameDataDocument } from '@/utils/mongodb/GameData';
import { GameResultModel, IGameResultDataDocument } from '@/utils/mongodb/GameResultData';
import { IInvitationDataDocument, InvitationModel, IInvitationResponse } from '@/utils/mongodb/InvitationData';
import { invitationToResponse, invitationUserIds } from '@/utils/games/invitationResponse';
import { buildUserDirectory, UserDirectory } from '@/utils/users/clerk';
import { GAME_META } from '@/utils/ui/games';
import type { ICompletedGame, IDashboardResponse } from '@/utils/apiModels/GameDataApi';

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
        forfeitedBy: result.forfeitedBy ? directory.name(result.forfeitedBy) : undefined,
        endedAt: result.endedAt,
    }));
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

    return {
        myTurn: games.filter(game => game.currentTurn === userId).map(game => game.CreateResponse(directory)),
        theirTurn: games.filter(game => game.currentTurn !== userId).map(game => game.CreateResponse(directory)),
        incoming: invitations.filter(({ invite }) => invite.senderId !== userId).map(({ response }) => response),
        outgoing: invitations.filter(({ invite }) => invite.senderId === userId).map(({ response }) => response),
        completed: toCompletedGames(results, directory),
    };
}
