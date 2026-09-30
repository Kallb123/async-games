// The win/loss/draw rule, which lives in exactly one function on purpose:
// "recent form" reads it per match and getPlayerStats folds every match
// through it for the W/L/D on a profile, so a case that is wrong here is
// wrong in both places at once — and used to be wrong in only one of them,
// when the profile totals were a second copy of the rule in Mongo `$cond`.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameResultModel, RESULT_COUNTS_FILTER, getGameStatsByPlayer, getPlayerStats, outcomeFor } from './GameResultData';

const ANN = 'user_ann';
const BOB = 'user_bob';

describe('outcomeFor', () => {
    it('gives the win to whoever is named as the winner, and a loss to everyone else', () => {
        expect(outcomeFor({ winner: ANN, endReason: 'win' }, ANN)).toBe('win');
        expect(outcomeFor({ winner: ANN, endReason: 'win' }, BOB)).toBe('loss');
    });

    it('gives a player the game dropped a loss, even when the team they left went on to win', () => {
        expect(outcomeFor({ winner: '', endReason: 'teamwin', droppedPlayers: [BOB] }, BOB)).toBe('loss');
        expect(outcomeFor({ winner: '', endReason: 'teamwin', droppedPlayers: [BOB] }, ANN)).toBe('win');
        expect(outcomeFor({ winner: BOB, endReason: 'win', droppedPlayers: [ANN] }, ANN)).toBe('loss');
    });

    it('reads a game nobody won as a draw', () => {
        expect(outcomeFor({ winner: '', endReason: 'ended' }, ANN)).toBe('draw');
    });

    it('takes the loss off the player who stopped turning up, not the table', () => {
        const abandoned = { winner: '', endReason: 'abandoned' as const, forfeitedBy: BOB };
        expect(outcomeFor(abandoned, BOB)).toBe('loss');
        expect(outcomeFor(abandoned, ANN)).toBe('draw');
    });

    it('gives a co-op table one result: everybody won, or everybody lost', () => {
        expect(outcomeFor({ winner: '', endReason: 'teamwin' }, ANN)).toBe('win');
        expect(outcomeFor({ winner: '', endReason: 'teamwin' }, BOB)).toBe('win');
        // Not the draw an empty winner would otherwise have read as.
        expect(outcomeFor({ winner: '', endReason: 'teamloss' }, ANN)).toBe('loss');
        expect(outcomeFor({ winner: '', endReason: 'teamloss' }, BOB)).toBe('loss');
    });

    it('still reads a result recorded before endReason existed', () => {
        expect(outcomeFor({ winner: ANN }, ANN)).toBe('win');
        expect(outcomeFor({ winner: ANN }, BOB)).toBe('loss');
        expect(outcomeFor({ winner: '' }, ANN)).toBe('draw');
    });

    it('reads a record with no winner field at all the way it reads an empty one', () => {
        // `winner` has no schema default, so an old record may carry none —
        // which means nobody won it, not that everybody lost it.
        expect(outcomeFor({}, ANN)).toBe('draw');
    });
});

// One row of the per-ending aggregation, as Mongo hands it back: the key has
// already been reduced to the answers outcomeFor needs (see the $group in
// getGameStatsByPlayer), so ANN's own win is her id in `winner`.
const ending = (url: string, key: { winner?: string, endReason?: string }, total: number) => ({
    _id: { url, winner: '', endReason: 'win', forfeitedBy: null, droppedPlayers: [], ...key },
    total,
});

const aggregateReturning = (rows: unknown[]) => vi.spyOn(GameResultModel, 'aggregate').mockResolvedValue(rows as never);

describe('getGameStatsByPlayer', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("matches only the player's counted games when no game is named", async () => {
        const aggregate = aggregateReturning([]);

        await getGameStatsByPlayer(ANN);

        const [pipeline] = aggregate.mock.calls[0] as unknown as [{ $match: unknown }[]];
        expect(pipeline[0]).toEqual({ $match: { playerIds: ANN, ...RESULT_COUNTS_FILTER } });
    });

    it('narrows the match to one game when asked, so the playerIds + gameType index serves it', async () => {
        const aggregate = aggregateReturning([]);

        await getGameStatsByPlayer(ANN, 'DiceCities');

        const [pipeline] = aggregate.mock.calls[0] as unknown as [{ $match: unknown }[]];
        expect(pipeline[0]).toEqual({ $match: { playerIds: ANN, gameType: 'DiceCities', ...RESULT_COUNTS_FILTER } });
    });

    it("tallies each game's endings through outcomeFor, most-played game first", async () => {
        aggregateReturning([
            ending('settlementsandcities', { winner: ANN }, 1),
            ending('dicecities', { winner: ANN }, 2),
            ending('dicecities', { winner: 'somebody else' }, 3),
            ending('dicecities', { winner: '', endReason: 'ended' }, 1),
        ]);

        expect(await getGameStatsByPlayer(ANN)).toEqual([
            { url: 'dicecities', wins: 2, losses: 3, draws: 1, total: 6 },
            { url: 'settlementsandcities', wins: 1, losses: 0, draws: 0, total: 1 },
        ]);
    });

    it('is nothing for a player with no finished games', async () => {
        aggregateReturning([]);
        expect(await getGameStatsByPlayer(ANN)).toEqual([]);
    });
});

describe('getPlayerStats', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("puts the same per-game tally beside the player's last matches", async () => {
        const find = vi.spyOn(GameResultModel, 'find').mockReturnValue({
            sort: () => ({ limit: () => ({ exec: async () => [
                { gameId: 'g1', url: 'dicecities', endedAt: '2026-01-02', winner: ANN, endReason: 'win', playerIds: [ANN, BOB] },
            ] }) }),
        } as never);
        aggregateReturning([ending('dicecities', { winner: ANN }, 1)]);

        const stats = await getPlayerStats(ANN, BOB);

        expect(find).toHaveBeenCalledWith({ playerIds: ANN, ...RESULT_COUNTS_FILTER });
        expect(stats.recent).toEqual([
            { gameId: 'g1', url: 'dicecities', endedAt: '2026-01-02', outcome: 'win', sharedWithViewer: true },
        ]);
        expect(stats.byGame).toEqual(await getGameStatsByPlayer(ANN));
    });
});
