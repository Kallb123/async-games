// The win/loss/draw rule, which lives in exactly one function on purpose:
// "recent form" reads it per match and getPlayerStats folds every match
// through it for the W/L/D on a profile, so a case that is wrong here is
// wrong in both places at once — and used to be wrong in only one of them,
// when the profile totals were a second copy of the rule in Mongo `$cond`.
//
// The same goes for which finished games count as *played* for an achievement
// (countsAsPlayed, and the fold that sums it into IGameStats.played): both are
// pure, and the aggregation between them is checked with Mongo stubbed out.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    GameResultModel,
    MIN_TURNS_TO_COUNT,
    RESULT_COUNTS_FILTER,
    countsAsPlayed,
    endedByHand,
    foldGameStats,
    getGameStatsByPlayer,
    getPlayerStats,
    matchResultOf,
    outcomeFor,
    recordGameResult,
    resultCounts,
} from './GameResultData';
import type { GameEndingRow } from './GameResultData';
import { AchievementUnlockModel } from './AchievementUnlockData';
import type { IGameData } from './GameData';
import type { GameEndReason } from '@/utils/apiModels/GameDataApi';

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

// Just enough of a finished game for countsAsPlayed: who sat, how it ended, and
// a commandHistory whose runs of one sender are what countTurns counts as turns.
const finished = (endReason: GameEndReason | undefined, userIdList: string[], senders: string[]) => ({
    userIdList,
    endReason,
    gameState: { commandHistory: senders.map(senderId => ({ senderId })) },
}) as unknown as IGameData;

// `turns` turns at a two-player table: each player's turn is one command, and
// the turn passes after it.
const turnsAtATable = (turns: number) => Array.from({ length: turns }, (_, i) => (i % 2 === 0 ? ANN : BOB));

describe('countsAsPlayed', () => {
    const table = [ANN, BOB];

    it('counts every ending the rules reached, even one that came straight away', () => {
        for (const endReason of ['win', 'teamwin', 'teamloss'] as const) {
            expect(countsAsPlayed(finished(endReason, table, [])), `${endReason}, no turns`).toBe(true);
            expect(countsAsPlayed(finished(endReason, table, turnsAtATable(1))), `${endReason}, one turn`).toBe(true);
        }
    });

    it('counts a game with no endReason, which the command route files as a win', () => {
        expect(countsAsPlayed(finished(undefined, table, []))).toBe(true);
        expect(countsAsPlayed(finished(undefined, table, turnsAtATable(1)))).toBe(true);
    });

    it("doesn't count a surrender after one turn, and does after two", () => {
        expect(countsAsPlayed(finished('ended', table, []))).toBe(false);
        expect(countsAsPlayed(finished('ended', table, turnsAtATable(MIN_TURNS_TO_COUNT - 1)))).toBe(false);
        expect(countsAsPlayed(finished('ended', table, turnsAtATable(MIN_TURNS_TO_COUNT)))).toBe(true);
        expect(countsAsPlayed(finished('ended', table, turnsAtATable(5)))).toBe(true);
    });

    it("doesn't count an abandonment after one turn, and does after two", () => {
        expect(countsAsPlayed(finished('abandoned', table, []))).toBe(false);
        expect(countsAsPlayed(finished('abandoned', table, turnsAtATable(MIN_TURNS_TO_COUNT - 1)))).toBe(false);
        expect(countsAsPlayed(finished('abandoned', table, turnsAtATable(MIN_TURNS_TO_COUNT)))).toBe(true);
    });

    it('measures turns, not commands: a turn of several commands is still one turn', () => {
        expect(countsAsPlayed(finished('ended', table, [ANN, ANN, ANN, ANN]))).toBe(false);
        expect(countsAsPlayed(finished('ended', table, [ANN, ANN, ANN, BOB, BOB]))).toBe(true);
    });

    it('never counts a solo game ended any way but by its rules, however many moves it took', () => {
        const manyMoves = Array.from({ length: 40 }, () => ANN);
        expect(countsAsPlayed(finished('ended', [ANN], manyMoves))).toBe(false);
        expect(countsAsPlayed(finished('abandoned', [ANN], manyMoves))).toBe(false);
    });

    it('still counts a solo game its rules ended', () => {
        expect(countsAsPlayed(finished('win', [ANN], [ANN]))).toBe(true);
        expect(countsAsPlayed(finished(undefined, [ANN], [ANN, ANN]))).toBe(true);
    });
});

describe('endedByHand', () => {
    it('is true for a surrender and an abandonment, which somebody chose', () => {
        expect(endedByHand('ended')).toBe(true);
        expect(endedByHand('abandoned')).toBe(true);
    });

    it('is false for every ending the rules reached, and for a missing one, which is filed as a win', () => {
        for (const endReason of ['win', 'teamwin', 'teamloss', undefined] as const) {
            expect(endedByHand(endReason), String(endReason)).toBe(false);
        }
    });
});

describe('matchResultOf', () => {
    const game = (droppedPlayers?: string[]) => ({
        winner: ANN,
        endReason: 'win',
        forfeitedBy: BOB,
        gameState: { droppedPlayers },
    }) as unknown as IGameData;

    it('reads the fields outcomeFor reads, off a live game', () => {
        expect(matchResultOf(game([BOB]))).toEqual({ winner: ANN, endReason: 'win', forfeitedBy: BOB, droppedPlayers: [BOB] });
    });

    it('answers as a stored result does: a copy of the dropped players, and none when there were none', () => {
        const dropped = [BOB];
        const copy = matchResultOf(game(dropped)).droppedPlayers;
        expect(copy).toEqual(dropped);
        expect(copy).not.toBe(dropped);
        expect(matchResultOf(game([])).droppedPlayers).toBeUndefined();
        expect(matchResultOf(game()).droppedPlayers).toBeUndefined();
    });

    it('gives outcomeFor the answer the stored result would', () => {
        expect(outcomeFor(matchResultOf(game()), ANN)).toBe('win');
        expect(outcomeFor(matchResultOf(game()), BOB)).toBe('loss');
        expect(outcomeFor(matchResultOf(game([ANN])), ANN)).toBe('loss');
    });
});

describe('the stored countsAsPlayed', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is a field of the schema, so strict mode keeps it instead of silently dropping it', () => {
        // Undeclared, Mongoose would drop it on create: every new record would
        // then read as having none, which counts, and the two-turn rule would
        // do nothing with no other test the wiser.
        const record = new GameResultModel({ gameId: 'g', countsAsPlayed: false });

        expect(record.countsAsPlayed).toBe(false);
        expect(record.toObject()).toHaveProperty('countsAsPlayed', false);
    });

    it('is written by recordGameResult from countsAsPlayed(gameData)', async () => {
        const create = vi.spyOn(GameResultModel, 'create').mockResolvedValue({} as never);
        // A game type with no stats of its own, so the base record goes in as it is.
        const recorded = (endReason: GameEndReason, senders: string[]) => ({
            gameId: 'g',
            gameType: { gameType: 'NoStatsYet', url: 'nostatsyet' },
            userIdList: [ANN, BOB],
            winner: '',
            endReason,
            gameState: { commandHistory: senders.map(senderId => ({ senderId })) },
        }) as unknown as IGameData;

        await recordGameResult(recorded('ended', [ANN]), [], new Map());
        await recordGameResult(recorded('ended', [ANN, BOB]), [], new Map());
        await recordGameResult(recorded('win', [ANN]), [], new Map());

        expect(create.mock.calls.map(([record]) => [record.totalTurns, record.countsAsPlayed])).toEqual([
            [1, false],
            [2, true],
            [1, true],
        ]);
    });
});

describe('foldGameStats', () => {
    it('counts a row with no countsAsPlayed as played, as every record from before the field does', () => {
        // The key exactly as the aggregation left it before the field existed.
        const legacy: GameEndingRow = { _id: { url: 'dicecities', winner: ANN, endReason: 'win' }, total: 2 };

        expect(foldGameStats([legacy], ANN)).toEqual([
            { url: 'dicecities', wins: 2, losses: 0, draws: 0, total: 2, played: 2 },
        ]);
    });

    it("adds a row that didn't count to the profile's tally but not to played", () => {
        const rows = [
            ending('dicecities', { winner: ANN }, 2),
            ending('dicecities', { winner: 'somebody else' }, 1),
            // Surrendered before two turns: a draw on the profile, nothing toward an achievement.
            ending('dicecities', { winner: '', endReason: 'ended', countsAsPlayed: false }, 3),
            // ...and one that lasted long enough.
            ending('dicecities', { winner: '', endReason: 'ended', countsAsPlayed: true }, 1),
            // Abandoned early by ANN: her loss, still not played.
            ending('dicecities', { winner: '', endReason: 'abandoned', forfeitedBy: ANN, countsAsPlayed: false }, 1),
        ];

        expect(foldGameStats(rows, ANN)).toEqual([
            { url: 'dicecities', wins: 2, losses: 2, draws: 4, total: 8, played: 4 },
        ]);
    });

    it('keeps each game to its own row', () => {
        const rows = [
            ending('dicecities', { winner: ANN }, 1),
            ending('settlementsandcities', { winner: ANN }, 1),
            ending('dicecities', { winner: '', endReason: 'ended', countsAsPlayed: false }, 1),
        ];

        expect(foldGameStats(rows, ANN)).toEqual([
            { url: 'dicecities', wins: 1, losses: 0, draws: 1, total: 2, played: 1 },
            { url: 'settlementsandcities', wins: 1, losses: 0, draws: 0, total: 1, played: 1 },
        ]);
    });

    it('puts the most-played game first, by total and not by played', () => {
        const rows = [
            ending('traintime', { winner: ANN }, 2),
            // Four finished games, none of them counted as played: still the most on the profile.
            ending('dicecities', { winner: '', endReason: 'ended', countsAsPlayed: false }, 4),
            ending('settlementsandcities', { winner: ANN }, 3),
        ];

        expect(foldGameStats(rows, ANN).map(game => game.url)).toEqual(['dicecities', 'settlementsandcities', 'traintime']);
    });

    it('is nothing when there are no rows', () => {
        expect(foldGameStats([], ANN)).toEqual([]);
    });
});

// One row of the per-ending aggregation, as Mongo hands it back: the key has
// already been reduced to the answers outcomeFor needs (see the $group in
// getGameStatsByPlayer), so ANN's own win is her id in `winner`. It says
// whether the game counted as played unless a test leaves that out.
const ending = (
    url: string,
    key: Partial<GameEndingRow['_id']>,
    total: number,
): GameEndingRow => ({
    _id: { url, winner: '', endReason: 'win', forfeitedBy: undefined, droppedPlayers: [], countsAsPlayed: true, ...key },
    total,
});

const aggregateReturning = (rows: unknown[]) => vi.spyOn(GameResultModel, 'aggregate').mockResolvedValue(rows as never);

// The in-memory twin of RESULT_COUNTS_FILTER: the judge asks it of a game that
// has no GameResult to filter on, so it has to answer what the filter would.
describe('resultCounts', () => {
    it('counts a table with no unclaimed guest at it', () => {
        expect(resultCounts([])).toBe(true);
    });

    it('stops counting once any one seat is an unclaimed guest', () => {
        expect(resultCounts([BOB])).toBe(false);
        expect(resultCounts([ANN, BOB])).toBe(false);
    });
});

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

    it("won't put a game that isn't a string into the match, where Mongoose would not cast it", async () => {
        const aggregate = aggregateReturning([]);

        // What a caller forwarding a request field could hand it.
        await getGameStatsByPlayer(ANN, { $ne: null } as unknown as string);

        const [pipeline] = aggregate.mock.calls[0] as unknown as [{ $match: unknown }[]];
        expect(pipeline[0]).toEqual({ $match: { playerIds: ANN, ...RESULT_COUNTS_FILTER } });
    });

    it("passes the caller's time limit to Mongo as the aggregation's own maxTimeMS", async () => {
        const aggregate = aggregateReturning([]);

        await getGameStatsByPlayer(ANN, 'DiceCities', { maxTimeMS: 2500 });

        const [, options] = aggregate.mock.calls[0] as unknown as [unknown, unknown];
        expect(options).toEqual({ maxTimeMS: 2500 });
    });

    it('sets no limit when the caller names none, as the profile reads it', async () => {
        const aggregate = aggregateReturning([]);

        await getGameStatsByPlayer(ANN);

        const [, options] = aggregate.mock.calls[0] as unknown as [unknown, unknown];
        expect(options).not.toHaveProperty('maxTimeMS');
    });

    it('groups on a countsAsPlayed that is true for a record with no such field', async () => {
        const aggregate = aggregateReturning([]);

        await getGameStatsByPlayer(ANN);

        const [pipeline] = aggregate.mock.calls[0] as unknown as [{ $group: { _id: Record<string, unknown> } }[]];
        // `$ne` against false: a missing field isn't false, so it counts, and
        // there is no third group for a record from before the field.
        expect(pipeline[1].$group._id.countsAsPlayed).toEqual({ $ne: ['$countsAsPlayed', false] });
    });

    it("tallies each game's endings through outcomeFor, most-played game first", async () => {
        aggregateReturning([
            ending('settlementsandcities', { winner: ANN }, 1),
            ending('dicecities', { winner: ANN }, 2),
            ending('dicecities', { winner: 'somebody else' }, 3),
            ending('dicecities', { winner: '', endReason: 'ended' }, 1),
            ending('dicecities', { winner: '', endReason: 'ended', countsAsPlayed: false }, 2),
        ]);

        expect(await getGameStatsByPlayer(ANN)).toEqual([
            { url: 'dicecities', wins: 2, losses: 3, draws: 3, total: 8, played: 6 },
            { url: 'settlementsandcities', wins: 1, losses: 0, draws: 0, total: 1, played: 1 },
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
        vi.spyOn(AchievementUnlockModel, 'find').mockReturnValue({ lean: () => ({ exec: async () => [] }) } as never);

        const stats = await getPlayerStats(ANN, BOB);

        expect(find).toHaveBeenCalledWith({ playerIds: ANN, ...RESULT_COUNTS_FILTER });
        expect(stats.recent).toEqual([
            { gameId: 'g1', url: 'dicecities', endedAt: '2026-01-02', outcome: 'win', sharedWithViewer: true },
        ]);
        expect(stats.byGame).toEqual(await getGameStatsByPlayer(ANN));
        expect(stats.achievements).toEqual([]);
    });

    /** GameResultModel.find answering both reads getPlayerStats makes: the recent matches, and which games still have a result. */
    const resultsFind = (gameIdsWithResults: string[]) => vi.spyOn(GameResultModel, 'find').mockImplementation(((filter: Record<string, unknown>) =>
        'gameId' in filter
            ? { lean: () => ({ exec: async () => gameIdsWithResults.map(gameId => ({ gameId })) }) }
            : { sort: () => ({ limit: () => ({ exec: async () => [] }) }) }) as never);

    it("lists the player's unlocks, marking each that still has a results page to link to", async () => {
        const find = resultsFind(['g_kept']);
        aggregateReturning([]);
        const unlocks = vi.spyOn(AchievementUnlockModel, 'find').mockReturnValue({ lean: () => ({ exec: async () => [
            { achievementId: 'dicecities.mayor', unlockedAt: '2026-03-02', gameId: 'g_gone', url: 'dicecities' },
            { achievementId: 'platform.first-win', unlockedAt: '2026-03-01', gameId: 'g_kept', url: 'dicecities' },
            // Backfilled: there was no game to point at, so there's nothing to link.
            { achievementId: 'platform.regular', unlockedAt: '2026-03-03' },
        ] }) } as never);

        const stats = await getPlayerStats(ANN, BOB);

        // Read by the unique index's userId prefix, and projected to what a row shows.
        expect(unlocks).toHaveBeenCalledWith({ userId: ANN }, { _id: 0, achievementId: 1, unlockedAt: 1, gameId: 1, url: 1 }, { maxTimeMS: expect.any(Number) });
        expect(find).toHaveBeenCalledWith({ gameId: { $in: ['g_kept', 'g_gone'] } }, { _id: 0, gameId: 1 });
        expect(stats.achievements).toEqual([
            { id: 'platform.first-win', unlockedAt: '2026-03-01', gameId: 'g_kept', url: 'dicecities', hasResult: true },
            { id: 'dicecities.mayor', unlockedAt: '2026-03-02', url: 'dicecities', hasResult: false },
            { id: 'platform.regular', unlockedAt: '2026-03-03' },
        ]);
    });

    it('still answers with the stats when the unlocks cannot be read', async () => {
        resultsFind([]);
        aggregateReturning([ending('dicecities', { winner: ANN }, 1)]);
        vi.spyOn(AchievementUnlockModel, 'find').mockReturnValue({ lean: () => ({ exec: async () => { throw new Error('Mongo said no'); } }) } as never);
        const errors = vi.spyOn(console, 'error').mockImplementation(() => { });

        const stats = await getPlayerStats(ANN, ANN);

        expect(stats.achievements).toEqual([]);
        expect(stats.byGame).toHaveLength(1);
        expect(errors).toHaveBeenCalledWith(`Couldn't read the achievements of ${ANN}; the profile shows none this time`, expect.any(Error));
    });
});
