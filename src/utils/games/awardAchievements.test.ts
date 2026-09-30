// Judging: docs/achievements.md §12, test 4. The judge decides what a player has
// earned at the end of a turn and at the end of a game, and everything it is
// handed comes from somewhere a test can put it: a catalogue passed in as the
// last parameter (the real one is empty until PR 3), a game built with the
// Dice Cities harness, a roster of Clerk-shaped users, the test unlock store in
// utils/testing/apiRoute.ts, and a player's record answered by hand.
//
// That record is the one thing stubbed beyond the stores: `getGameStatsByPlayer`
// is an aggregation over a database these tests don't have, and what it returns
// is exactly what the career half is judged on. Everything else in
// GameResultData (outcomeFor, countsAsPlayed, resultCounts) is the real thing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());
vi.mock('@/utils/mongodb/mongodb', async () => (await import('@/utils/testing/apiRoute')).mongodbStub());
vi.mock('@/utils/mongodb/GameResultData', async importOriginal => ({
    ...(await importOriginal<typeof import('@/utils/mongodb/GameResultData')>()),
    getGameStatsByPlayer: vi.fn(),
}));

import type { User } from '@clerk/nextjs/server';
import { PLAYERS, passCommand, replayableGame, rollCommand } from '@/games/DiceCities/testHarness';
import { buildInitialDiceCitiesState } from '@/games/DiceCities/DiceCitiesModels';
import type { IDiceCitiesGameStateResponse } from '@/games/DiceCities/apiModels';
import { makeGame, makeState, player as sacPlayer } from '@/games/SettlementsAndCities/testFixtures';
import { gameStateToResponse as sacStateToResponse } from '@/games/SettlementsAndCities/SettlementsAndCitiesModels';
import type { ISettlementsAndCitiesGameData } from '@/games/SettlementsAndCities/SettlementsAndCitiesModels';
import type { GameEndReason } from '@/utils/apiModels/GameDataApi';
import type { IGameCommand } from '@/utils/apiModels/GameLogic';
import { AchievementUnlockModel } from '@/utils/mongodb/AchievementUnlockData';
import type { IGameData } from '@/utils/mongodb/GameData';
import { getGameStatsByPlayer } from '@/utils/mongodb/GameResultData';
import type { IGameStats } from '@/utils/mongodb/GameResultData';
import { ending, ownCareer, platform, turnEnd } from '@/utils/testing/achievementFixtures';
import { resetApiRouteStubs, seedAchievementUnlock, storedAchievementUnlocks } from '@/utils/testing/apiRoute';
import { judgeGameEnd, judgeTurnEnd, NO_UNLOCKS, tableView } from './awardAchievements';
import type {
    AchievementCatalogue,
    CareerRecord,
    FinishedSeat,
    GameAchievement,
    GameRecord,
    PlatformAchievement,
    Seat,
} from './achievements';
import { getReplayAdapter } from './replay';

const ANN = PLAYERS[0];
const BOB = PLAYERS[1];
const GAME_ID = 'g1';

// ─── Rosters ─────────────────────────────────────────────────────────────────

/** A Clerk user, as far as the judge reads one: an id and whether they're a guest. */
const registered = (id: string) => ({ id, publicMetadata: {} }) as unknown as User;
const guest = (id: string) => ({ id, publicMetadata: { guest: true } }) as unknown as User;

const TABLE = PLAYERS.map(registered);

// ─── Achievements ────────────────────────────────────────────────────────────

/** Dice Cities' own achievements, and the platform's. */
const catalogueOf = (games: GameAchievement<any>[], platformOnes: PlatformAchievement[] = []): AchievementCatalogue =>
    ({ games: { dicecities: games }, platform: platformOnes });

/** A check that can be asked, and asked again: it says how it was called. */
const passing = () => vi.fn<(view: any, seat: Seat) => boolean>(() => true);

const isRich = (view: IDiceCitiesGameStateResponse, { userId }: Seat) => view.playerStates[userId].money >= 50;

// ─── Games ───────────────────────────────────────────────────────────────────

/** A live Dice Cities game at its opening, with `coins` set for whoever it names. */
function diceGame(coins: Record<string, number> = {}, commands: IGameCommand[] = []): IGameData {
    const state = buildInitialDiceCitiesState(PLAYERS);
    for (const [userId, money] of Object.entries(coins)) state.playerStates.get(userId)!.money = money;
    return replayableGame(commands, state);
}

const ONE_TURN = [rollCommand(1, ANN), passCommand(ANN)];
const THREE_TURNS = [rollCommand(1, ANN), passCommand(ANN), rollCommand(1, BOB), passCommand(BOB), rollCommand(1, ANN)];

/** The same game once it is over: Ann won it if the rules ended it, nobody did if it was stopped. */
function finishedGame(endReason: GameEndReason = 'win', coins: Record<string, number> = {}, commands = THREE_TURNS): IGameData {
    const game = diceGame(coins, commands);
    game.complete = true;
    game.winner = endReason === 'win' ? ANN : '';
    game.endReason = endReason;
    game.currentTurn = '';
    return game;
}

// ─── A player's record ───────────────────────────────────────────────────────

const GAME_TYPE_OF: Record<string, string> = { dicecities: 'DiceCities', settlementsandcities: 'SettlementsAndCities' };

/** One game's tally, after the game under test: every game played counts as played unless `played` says otherwise. */
const tally = (url: string, total: number, wins = 0, played = total): IGameStats =>
    ({ url, wins, losses: total - wins, draws: 0, total, played });

/** Who has what record. `getGameStatsByPlayer` answers from it, and honours the game it is narrowed to. */
function recordsAre(records: Record<string, IGameStats[]>) {
    vi.mocked(getGameStatsByPlayer).mockImplementation(async (userId, gameType) =>
        (records[userId] ?? []).filter(stats => !gameType || GAME_TYPE_OF[stats.url] === gameType));
}

// ─── The stores ──────────────────────────────────────────────────────────────

let warn: MockInstance<typeof console.warn>;

beforeEach(async () => {
    await resetApiRouteStubs();
    vi.mocked(AchievementUnlockModel.find).mockClear();
    vi.mocked(AchievementUnlockModel.bulkWrite).mockClear();
    vi.mocked(getGameStatsByPlayer).mockReset();
    vi.mocked(getGameStatsByPlayer).mockResolvedValue([]);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
});

afterEach(() => {
    vi.restoreAllMocks();
});

const reads = () => vi.mocked(AchievementUnlockModel.find).mock.calls.length;

/** Watches the view being built, for the tests that assert it wasn't. */
const viewsBuilt = () => vi.spyOn(getReplayAdapter('DiceCitiesGameType')!, 'toResponseState');

// ─── The table view ──────────────────────────────────────────────────────────

describe('the table view', () => {
    // Settlements & Cities, not Dice Cities: its response is built per viewer,
    // and Dice Cities' ignores the viewer, so it couldn't catch a `null` that
    // had been loosened into the seat's own id.
    const SECRET = 9173;

    /** Ann holds the sentinel in every private place a hand has in the response. */
    function sacGame(): ISettlementsAndCitiesGameData {
        return makeGame(makeState({
            playerStates: new Map([
                [ANN, sacPlayer({
                    resources: { ore: SECRET, wool: 2 },
                    devCards: { knight: SECRET, victoryPoint: 4 },
                    newDevCards: { roadBuilding: SECRET },
                })],
                [BOB, sacPlayer({ resources: { grain: 3 } })],
            ]),
        }));
    }

    it('keeps every seat\'s hand out of the view a check is given, at either checkpoint', async () => {
        const seen: { at: string, userId: string, view: string }[] = [];
        const record = (at: string) => (view: unknown, seat: Seat) => {
            seen.push({ at, userId: seat.userId, view: JSON.stringify(view) });
            return false;
        };
        const catalogue: AchievementCatalogue = {
            games: { settlementsandcities: [turnEnd('sac.turn', record('turnEnd')), ending('sac.end', record('end'))] },
            platform: [],
        };

        const game = sacGame();
        await judgeTurnEnd(game, TABLE, catalogue);
        game.complete = true;
        game.winner = ANN;
        game.endReason = 'win';
        await judgeGameEnd(game, TABLE, { recorded: true }, catalogue);

        // Each seat is judged at the turn end, and again (turn end, then end) on
        // the finished game, so there is a view for every one of those asks.
        expect(seen.filter(({ at }) => at === 'turnEnd')).toHaveLength(4);
        expect(seen.filter(({ at }) => at === 'end').map(({ userId }) => userId)).toEqual([ANN, BOB]);
        for (const { view } of seen) {
            expect(view).not.toContain(String(SECRET));
            const parsed = JSON.parse(view);
            expect(parsed.playerDevCards).toEqual({});
            expect(parsed.playerNewDevCards).toEqual({});
            // A hand's size is public and its make-up isn't, so the count comes
            // through: this is the real response, not an emptied one.
            expect(parsed.playerStates[ANN].resources).toBeUndefined();
            expect(parsed.playerStates[ANN].resourceCount).toBe(SECRET + 2);
        }
    });

    it('could have shown the hand: the same state, asked for by its owner, does', () => {
        // The control for the test above, which passes for want of anything to
        // find if the sentinel isn't reachable in the response at all.
        const asAnn = JSON.stringify(sacStateToResponse(sacGame().specificGameState, { [ANN]: ANN, [BOB]: BOB }, ANN));
        expect(asAnn).toContain(String(SECRET));
    });

    it('takes the game and nothing else: there is no viewer to pass', () => {
        expect(tableView).toHaveLength(1);
    });

    it('refuses a game with no replay adapter, naming it', () => {
        const solitaire = { gameType: { className: 'SolitaireGameType', url: 'solitaire' }, userIdList: [ANN], gameState: { commandHistory: [] } } as unknown as IGameData;
        expect(() => tableView(solitaire)).toThrow(/SolitaireGameType/);
    });
});

// ─── The end of a turn ───────────────────────────────────────────────────────

describe('judgeTurnEnd', () => {
    const rich = () => turnEnd('dicecities.rich', isRich);

    it('unlocks what passes on the live view, for the game that did it', async () => {
        const check = vi.fn(isRich);
        const achievement = turnEnd('dicecities.rich', check);

        const before = Date.now();
        const earned = await judgeTurnEnd(diceGame({ [ANN]: 99 }), TABLE, catalogueOf([achievement]));
        const after = Date.now();

        expect(earned).toEqual([{ userId: ANN, achievement }]);
        expect(earned[0].achievement).toBe(achievement);
        expect(storedAchievementUnlocks()).toEqual([
            { userId: ANN, achievementId: 'dicecities.rich', gameId: GAME_ID, url: 'dicecities', unlockedAt: expect.any(String) },
        ]);
        // The judge's own clock, not the timestamp of any command.
        const unlockedAt = Date.parse(storedAchievementUnlocks()[0].unlockedAt);
        expect(unlockedAt).toBeGreaterThanOrEqual(before);
        expect(unlockedAt).toBeLessThanOrEqual(after);
        // A turn-end check is handed its seat and nothing more.
        expect(check).toHaveBeenCalledWith(expect.objectContaining({ playerStates: expect.anything() }), { userId: ANN });
    });

    it('writes nothing for a check that fails on the live view', async () => {
        const earned = await judgeTurnEnd(diceGame(), TABLE, catalogueOf([rich()]));

        expect(earned).toEqual([]);
        expect(storedAchievementUnlocks()).toEqual([]);
        expect(vi.mocked(AchievementUnlockModel.bulkWrite)).not.toHaveBeenCalled();
    });

    it('judges every seat, not only the mover: a move can hand someone else theirs', async () => {
        // u1 is whose turn it is; it is u2's coins that have just crossed the line.
        const game = diceGame({ [BOB]: 99 });
        expect(game.currentTurn).toBe(ANN);

        const earned = await judgeTurnEnd(game, TABLE, catalogueOf([rich()]));

        expect(earned.map(({ userId }) => userId)).toEqual([BOB]);
        expect(storedAchievementUnlocks().map(({ userId }) => userId)).toEqual([BOB]);
    });

    it('unlocks the same thing for two seats at once', async () => {
        const earned = await judgeTurnEnd(diceGame({ [ANN]: 99, [BOB]: 99 }), TABLE, catalogueOf([rich()]));

        expect(earned.map(({ userId }) => userId)).toEqual([ANN, BOB]);
    });

    it('does not judge a seat the game dropped', async () => {
        const check = vi.fn(isRich);
        const game = diceGame({ [ANN]: 99, [BOB]: 99 });
        game.gameState.droppedPlayers = [BOB];

        const earned = await judgeTurnEnd(game, TABLE, catalogueOf([turnEnd('dicecities.rich', check)]));

        expect(earned.map(({ userId }) => userId)).toEqual([ANN]);
        expect(check).toHaveBeenCalledTimes(1);
    });

    it('does not ask a seat about an achievement it already holds', async () => {
        const check = vi.fn(isRich);
        seedAchievementUnlock({ userId: ANN, achievementId: 'dicecities.rich', unlockedAt: '2026-01-01T00:00:00.000Z', gameId: 'older', url: 'dicecities' });

        const earned = await judgeTurnEnd(diceGame({ [ANN]: 99, [BOB]: 99 }), TABLE, catalogueOf([turnEnd('dicecities.rich', check)]));

        expect(earned.map(({ userId }) => userId)).toEqual([BOB]);
        expect(check).toHaveBeenCalledTimes(1);
        expect(check).toHaveBeenCalledWith(expect.anything(), { userId: BOB });
    });

    it('builds no view once every seat holds everything', async () => {
        for (const userId of PLAYERS) {
            seedAchievementUnlock({ userId, achievementId: 'dicecities.rich', unlockedAt: '2026-01-01T00:00:00.000Z', gameId: 'older', url: 'dicecities' });
        }
        const build = viewsBuilt();

        expect(await judgeTurnEnd(diceGame({ [ANN]: 99 }), TABLE, catalogueOf([rich()]))).toEqual([]);

        expect(reads()).toBe(1);
        expect(build).not.toHaveBeenCalled();
    });

    it('judges nothing at an exhibition table, where a seat is an unclaimed guest', async () => {
        const check = passing();
        const build = viewsBuilt();

        const earned = await judgeTurnEnd(diceGame(), [registered(ANN), guest(BOB)], catalogueOf([turnEnd('dicecities.any', check)]));

        expect(earned).toEqual([]);
        expect(storedAchievementUnlocks()).toEqual([]);
        expect(check).not.toHaveBeenCalled();
        expect(build).not.toHaveBeenCalled();
    });

    it('judges nothing when Clerk does not return a seat, which is treated as a guest', async () => {
        // The stale-guest sweeper can delete a guest who is still seated, and
        // usersById then leaves them out without saying so.
        const check = passing();

        const earned = await judgeTurnEnd(diceGame(), [registered(ANN)], catalogueOf([turnEnd('dicecities.any', check)]));

        expect(earned).toEqual([]);
        expect(storedAchievementUnlocks()).toEqual([]);
        expect(check).not.toHaveBeenCalled();
    });

    it('returns before any read or view when this game has no turn-end achievements', async () => {
        const build = viewsBuilt();
        const catalogues = [
            catalogueOf([]),
            // Only a result's worth or a record's worth to judge, which a turn end has neither of.
            catalogueOf([ending('dicecities.end', () => true), ownCareer('dicecities.mayor', record => record.won, 1)], [platform('platform.first', career => career.won, 1)]),
            // Another game's achievements aren't this game's.
            { games: { settlementsandcities: [turnEnd('sac.turn', () => true)] }, platform: [] },
            // The real catalogue's shape, before any game has written one.
            { games: {}, platform: [] },
        ];

        for (const catalogue of catalogues) {
            expect(await judgeTurnEnd(diceGame(), TABLE, catalogue)).toBe(NO_UNLOCKS);
        }

        expect(reads()).toBe(0);
        expect(build).not.toHaveBeenCalled();
        expect(getGameStatsByPlayer).not.toHaveBeenCalled();
    });
});

// ─── The end of a game ───────────────────────────────────────────────────────

describe('judgeGameEnd', () => {
    const recorded = { recorded: true };

    describe('match achievements', () => {
        it('hands an end check the seat\'s outcome and the game\'s length', async () => {
            const check = vi.fn<(view: any, seat: FinishedSeat) => boolean>(() => false);

            await judgeGameEnd(finishedGame('win'), TABLE, recorded, catalogueOf([ending('dicecities.end', check)]));

            // Ann won it and Bob lost it, in a game that ran three turns.
            expect(check).toHaveBeenCalledWith(expect.anything(), { userId: ANN, outcome: 'win', turns: 3 });
            expect(check).toHaveBeenCalledWith(expect.anything(), { userId: BOB, outcome: 'loss', turns: 3 });
        });

        it('unlocks an end achievement for the seat whose result passes it, for this game', async () => {
            const victor = ending('dicecities.victor', (_view, seat) => seat.outcome === 'win' && seat.turns === 3);

            const earned = await judgeGameEnd(finishedGame('win'), TABLE, recorded, catalogueOf([victor]));

            expect(earned).toEqual([{ userId: ANN, achievement: victor }]);
            expect(storedAchievementUnlocks()).toEqual([
                { userId: ANN, achievementId: 'dicecities.victor', gameId: GAME_ID, url: 'dicecities', unlockedAt: expect.any(String) },
            ]);
        });

        it('hands no result to a turn-end check, final state or not', async () => {
            const check = vi.fn(isRich);

            await judgeGameEnd(finishedGame('win', { [ANN]: 99 }), TABLE, recorded, catalogueOf([turnEnd('dicecities.rich', check)]));

            expect(check).toHaveBeenCalledWith(expect.anything(), { userId: ANN });
            expect(check).toHaveBeenCalledWith(expect.anything(), { userId: BOB });
        });

        it('judges the final state once more, so a turn-end achievement the last move earned still unlocks', async () => {
            const achievement = turnEnd('dicecities.rich', isRich);

            const earned = await judgeGameEnd(finishedGame('win', { [BOB]: 99 }), TABLE, recorded, catalogueOf([achievement]));

            expect(earned).toEqual([{ userId: BOB, achievement }]);
            expect(storedAchievementUnlocks()).toEqual([
                { userId: BOB, achievementId: 'dicecities.rich', gameId: GAME_ID, url: 'dicecities', unlockedAt: expect.any(String) },
            ]);
        });

        it.each(['win', 'teamwin', 'teamloss'] as const)('judges the match achievements of a %s', async endReason => {
            const check = passing();

            await judgeGameEnd(finishedGame(endReason), TABLE, recorded, catalogueOf([ending('dicecities.end', check)]));

            expect(check).toHaveBeenCalledTimes(2);
        });

        it.each(['ended', 'abandoned'] as const)('judges no match achievement of a game that was %s', async endReason => {
            const end = passing();
            const turn = passing();
            const build = viewsBuilt();

            const earned = await judgeGameEnd(finishedGame(endReason, { [ANN]: 99 }), TABLE, recorded,
                catalogueOf([ending('dicecities.end', end), turnEnd('dicecities.rich', turn)]));

            // Nothing a surrender can judge is left, so it stops before the read.
            expect(earned).toBe(NO_UNLOCKS);
            expect(reads()).toBe(0);
            expect(end).not.toHaveBeenCalled();
            expect(turn).not.toHaveBeenCalled();
            expect(build).not.toHaveBeenCalled();
        });

        it('still judges them when the game was not recorded', async () => {
            const victor = ending('dicecities.victor', (_view, seat) => seat.outcome === 'win');

            const earned = await judgeGameEnd(finishedGame('win'), TABLE, { recorded: false }, catalogueOf([victor, ownCareer('dicecities.mayor', record => record.played, 1)]));

            expect(earned).toEqual([{ userId: ANN, achievement: victor }]);
            expect(getGameStatsByPlayer).not.toHaveBeenCalled();
        });

        it('does not judge a seat the game dropped', async () => {
            const check = passing();
            const game = finishedGame('win');
            game.gameState.droppedPlayers = [BOB];

            await judgeGameEnd(game, TABLE, recorded, catalogueOf([ending('dicecities.end', check)]));

            expect(check).toHaveBeenCalledTimes(1);
            expect(check).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: ANN }));
        });

        it('still has its end and career achievements judged for a seat holding every turn-end one', async () => {
            const rich = turnEnd('dicecities.rich', vi.fn(isRich));
            const victor = ending('dicecities.victor', (_view, seat) => seat.outcome === 'win');
            const mayor = ownCareer('dicecities.mayor', record => record.won, 1);
            for (const userId of PLAYERS) {
                seedAchievementUnlock({ userId, achievementId: 'dicecities.rich', unlockedAt: '2026-01-01T00:00:00.000Z', gameId: 'older', url: 'dicecities' });
            }
            recordsAre({ [ANN]: [tally('dicecities', 1, 1)] });

            const earned = await judgeGameEnd(finishedGame('win'), TABLE, recorded, catalogueOf([rich, victor, mayor]));

            expect(rich.criteria.kind === 'match' && rich.criteria.check).not.toHaveBeenCalled();
            expect(earned.map(({ userId, achievement }) => [userId, achievement.id])).toEqual([
                [ANN, 'dicecities.victor'],
                [ANN, 'dicecities.mayor'],
            ]);
        });

        it('carries on to the career half when the view cannot be built', async () => {
            vi.spyOn(getReplayAdapter('DiceCitiesGameType')!, 'toResponseState').mockImplementation(() => { throw new Error('no view'); });
            const mayor = ownCareer('dicecities.mayor', record => record.won, 1);
            recordsAre({ [ANN]: [tally('dicecities', 1, 1)] });

            const earned = await judgeGameEnd(finishedGame('win'), TABLE, recorded, catalogueOf([turnEnd('dicecities.rich', () => true), mayor]));

            expect(earned).toEqual([{ userId: ANN, achievement: mayor }]);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining(GAME_ID), expect.any(Error));
        });
    });

    describe('career achievements', () => {
        // Ann's record, after this game: 4 Dice Cities games, 2 won, and 2 of
        // Settlements & Cities, 1 won.
        const ANNS_RECORD = [tally('dicecities', 4, 2), tally('settlementsandcities', 2, 1)];

        it('gives a game\'s own the record at that game and the platform\'s the record across every game', async () => {
            const ownProgress = vi.fn<(record: GameRecord) => number>(record => record.won);
            const platformProgress = vi.fn<(record: CareerRecord) => number>(career => career.played);
            recordsAre({ [ANN]: ANNS_RECORD });

            await judgeGameEnd(finishedGame('win'), TABLE, recorded, catalogueOf(
                [ownCareer('dicecities.mayor', ownProgress, 100)],
                [platform('platform.regular', platformProgress, 100)],
            ));

            // Both as they stand with this game in them, which is how
            // getGameStatsByPlayer reads once it has been recorded.
            expect(ownProgress).toHaveBeenCalledWith({ played: 4, won: 2 });
            expect(platformProgress).toHaveBeenCalledWith({
                played: 6,
                won: 3,
                games: { dicecities: { played: 4, won: 2 }, settlementsandcities: { played: 2, won: 1 } },
            });
        });

        it('tells an unlock this game tipped from one it only backfilled', async () => {
            // Ann has won 3 of her 6 games, this one included, so her record
            // without it is 5 played and 2 won.
            const ownTipped = ownCareer('dicecities.won-3', record => record.won, 3);
            const platformTipped = platform('platform.played-6', career => career.played, 6);
            const ownBackfilled = ownCareer('dicecities.won-2', record => record.won, 2);
            const platformBackfilled = platform('platform.played-5', career => career.played, 5);
            recordsAre({ [ANN]: [tally('dicecities', 6, 3)] });

            const earned = await judgeGameEnd(finishedGame('win'), TABLE, recorded,
                catalogueOf([ownTipped, ownBackfilled], [platformTipped, platformBackfilled]));

            // Announced: only what this game earned, for the game's results page and push.
            expect(earned.map(({ userId, achievement }) => [userId, achievement.id])).toEqual([
                [ANN, 'dicecities.won-3'],
                [ANN, 'platform.played-6'],
            ]);
            const stored = storedAchievementUnlocks();
            expect(stored.map(({ achievementId }) => achievementId).sort()).toEqual(
                ['dicecities.won-2', 'dicecities.won-3', 'platform.played-5', 'platform.played-6']);
            for (const row of stored) {
                if (['dicecities.won-3', 'platform.played-6'].includes(row.achievementId)) {
                    expect(row).toMatchObject({ gameId: GAME_ID, url: 'dicecities' });
                } else {
                    // Already true before this game, so there is no game to point at.
                    expect(row).not.toHaveProperty('gameId');
                    expect(row).not.toHaveProperty('url');
                }
            }
        });

        it('judges the record without this game for the tipped-or-backfilled split', async () => {
            const progress = vi.fn<(record: GameRecord) => number>(record => record.won);
            // Bob already holds it, so Ann's are the only calls there are.
            seedAchievementUnlock({ userId: BOB, achievementId: 'dicecities.won-3', unlockedAt: '2026-01-01T00:00:00.000Z', gameId: 'older', url: 'dicecities' });
            recordsAre({ [ANN]: [tally('dicecities', 6, 3)] });

            await judgeGameEnd(finishedGame('win'), TABLE, recorded, catalogueOf([ownCareer('dicecities.won-3', progress, 3)]));

            expect(progress.mock.calls.map(([record]) => record)).toEqual([
                { played: 6, won: 3 },
                { played: 5, won: 2 },
            ]);
        });

        it('does not take a win out of the record for a seat that did not win', async () => {
            // Bob lost this game, so his record without it still has both wins:
            // he met "win 2" before it, and it is a backfill.
            recordsAre({ [BOB]: [tally('dicecities', 4, 2)] });

            const earned = await judgeGameEnd(finishedGame('win'), TABLE, recorded, catalogueOf([ownCareer('dicecities.won-2', record => record.won, 2)]));

            expect(earned).toEqual([]);
            expect(storedAchievementUnlocks()).toEqual([
                { userId: BOB, achievementId: 'dicecities.won-2', unlockedAt: expect.any(String) },
            ]);
        });

        it('tips a platform achievement in a game with no catalogue of its own', async () => {
            const firstWin = platform('platform.first-win', career => career.won, 1);
            recordsAre({ [ANN]: [tally('dicecities', 1, 1)], [BOB]: [tally('dicecities', 1, 0)] });

            const earned = await judgeGameEnd(finishedGame('win'), TABLE, recorded, { games: {}, platform: [firstWin] });

            expect(earned).toEqual([{ userId: ANN, achievement: firstWin }]);
            expect(storedAchievementUnlocks()).toEqual([
                { userId: ANN, achievementId: 'platform.first-win', gameId: GAME_ID, url: 'dicecities', unlockedAt: expect.any(String) },
            ]);
        });

        it('skips career for a game that was not recorded, and judges nothing at all if that is all there is', async () => {
            recordsAre({ [ANN]: [tally('dicecities', 1, 1)] });

            const earned = await judgeGameEnd(finishedGame('win'), TABLE, { recorded: false }, catalogueOf([ownCareer('dicecities.mayor', record => record.won, 1)]));

            expect(earned).toBe(NO_UNLOCKS);
            expect(getGameStatsByPlayer).not.toHaveBeenCalled();
            expect(reads()).toBe(0);
        });

        it('counts a surrendered game toward career once it has lasted two turns', async () => {
            const build = viewsBuilt();
            const played = platform('platform.played-1', career => career.played, 1);
            recordsAre({ [ANN]: [tally('dicecities', 1)], [BOB]: [tally('dicecities', 1)] });

            const earned = await judgeGameEnd(finishedGame('ended', {}, THREE_TURNS), TABLE, recorded,
                catalogueOf([turnEnd('dicecities.rich', () => true)], [played]));

            expect(earned.map(({ userId }) => userId)).toEqual([ANN, BOB]);
            expect(build).not.toHaveBeenCalled();
        });

        it('never tips a played achievement with a game that did not count as played', async () => {
            // Surrendered after one turn: it is in the profile's total but not in
            // "played", so the stats say 1 played *without* it counting, and the
            // game must not be taken back out of a record it was never in.
            const played = platform('platform.played-1', career => career.played, 1);
            recordsAre({ [ANN]: [tally('dicecities', 2, 0, 1)], [BOB]: [tally('dicecities', 1, 0, 0)] });

            const earned = await judgeGameEnd(finishedGame('ended', {}, ONE_TURN), TABLE, recorded, catalogueOf([], [played]));

            // Ann played one game before this one; Bob's only game is this one, which doesn't count.
            expect(earned).toEqual([]);
            expect(storedAchievementUnlocks()).toEqual([
                { userId: ANN, achievementId: 'platform.played-1', unlockedAt: expect.any(String) },
            ]);
        });

        it('reads the whole record for a seat lacking a platform achievement, and one game for a seat lacking only the game\'s own', async () => {
            const mayor = ownCareer('dicecities.mayor', record => record.won, 100);
            const regular = platform('platform.regular', career => career.played, 100);
            // Ann holds the platform's, so only the game's own is left to judge.
            seedAchievementUnlock({ userId: ANN, achievementId: 'platform.regular', unlockedAt: '2026-01-01T00:00:00.000Z' });

            await judgeGameEnd(finishedGame('win'), TABLE, recorded, catalogueOf([mayor], [regular]));

            expect(getGameStatsByPlayer).toHaveBeenCalledWith(ANN, 'DiceCities');
            expect(getGameStatsByPlayer).toHaveBeenCalledWith(BOB);
            expect(getGameStatsByPlayer).toHaveBeenCalledTimes(2);
        });

        it('judges a game\'s own achievement on the narrowed read', async () => {
            const mayor = ownCareer('dicecities.mayor', record => record.won, 2);
            seedAchievementUnlock({ userId: ANN, achievementId: 'platform.first-win', unlockedAt: '2026-01-01T00:00:00.000Z' });
            recordsAre({ [ANN]: [tally('dicecities', 2, 2), tally('settlementsandcities', 9, 9)] });

            const earned = await judgeGameEnd(finishedGame('win'), [registered(ANN), registered(BOB)], recorded,
                catalogueOf([mayor], [platform('platform.first-win', career => career.won, 1)]));

            expect(earned).toEqual([{ userId: ANN, achievement: mayor }]);
        });

        it('skips a seat that holds every career achievement, and reads nothing for it', async () => {
            const mayor = ownCareer('dicecities.mayor', record => record.won, 1);
            const firstWin = platform('platform.first-win', career => career.won, 1);
            for (const achievementId of [mayor.id, firstWin.id]) {
                seedAchievementUnlock({ userId: ANN, achievementId, unlockedAt: '2026-01-01T00:00:00.000Z', gameId: 'older', url: 'dicecities' });
            }

            await judgeGameEnd(finishedGame('win'), TABLE, recorded, catalogueOf([mayor], [firstWin]));

            expect(getGameStatsByPlayer).toHaveBeenCalledTimes(1);
            expect(getGameStatsByPlayer).toHaveBeenCalledWith(BOB);
        });

        it('costs only the seat whose record could not be read', async () => {
            const mayor = ownCareer('dicecities.mayor', record => record.won, 1);
            vi.mocked(getGameStatsByPlayer).mockImplementation(async userId => {
                if (userId === BOB) throw new Error('aggregation timed out');
                return [tally('dicecities', 1, 1)];
            });

            const earned = await judgeGameEnd(finishedGame('win'), TABLE, recorded, catalogueOf([mayor]));

            expect(earned).toEqual([{ userId: ANN, achievement: mayor }]);
            expect(warn).toHaveBeenCalledWith(expect.stringContaining(BOB), expect.any(Error));
        });

        it('judges nothing at an exhibition table, or where Clerk did not return a seat', async () => {
            const catalogue = catalogueOf([ownCareer('dicecities.mayor', record => record.played, 1), ending('dicecities.end', () => true)]);
            recordsAre({ [ANN]: [tally('dicecities', 1, 1)], [BOB]: [tally('dicecities', 1)] });

            expect(await judgeGameEnd(finishedGame('win'), [registered(ANN), guest(BOB)], recorded, catalogue)).toBe(NO_UNLOCKS);
            expect(await judgeGameEnd(finishedGame('win'), [registered(ANN)], recorded, catalogue)).toBe(NO_UNLOCKS);

            expect(storedAchievementUnlocks()).toEqual([]);
            expect(reads()).toBe(0);
            expect(getGameStatsByPlayer).not.toHaveBeenCalled();
        });
    });

    it('returns before any read when the catalogue has nothing for this game or the platform', async () => {
        expect(await judgeGameEnd(finishedGame('win'), TABLE, recorded, { games: {}, platform: [] })).toBe(NO_UNLOCKS);
        expect(await judgeGameEnd(finishedGame('win'), TABLE, recorded, catalogueOf([]))).toBe(NO_UNLOCKS);

        expect(reads()).toBe(0);
        expect(getGameStatsByPlayer).not.toHaveBeenCalled();
    });
});

// ─── Both ────────────────────────────────────────────────────────────────────

describe('judging twice, or at once', () => {
    const catalogue = () => catalogueOf(
        [turnEnd('dicecities.rich', isRich), ending('dicecities.victor', (_view, seat) => seat.outcome === 'win'), ownCareer('dicecities.mayor', record => record.won, 1)],
        [platform('platform.first-win', career => career.won, 1)],
    );

    it('inserts nothing and returns nothing the second time a turn end is judged', async () => {
        const judged = catalogueOf([turnEnd('dicecities.rich', isRich)]);

        expect(await judgeTurnEnd(diceGame({ [ANN]: 99 }), TABLE, judged)).toHaveLength(1);
        expect(await judgeTurnEnd(diceGame({ [ANN]: 99 }), TABLE, judged)).toEqual([]);

        expect(storedAchievementUnlocks()).toHaveLength(1);
    });

    it('inserts nothing and returns nothing the second time a game end is judged', async () => {
        recordsAre({ [ANN]: [tally('dicecities', 1, 1)] });

        const first = await judgeGameEnd(finishedGame('win', { [ANN]: 99 }), TABLE, { recorded: true }, catalogue());
        const stored = storedAchievementUnlocks();
        const second = await judgeGameEnd(finishedGame('win', { [ANN]: 99 }), TABLE, { recorded: true }, catalogue());

        expect(first.map(({ achievement }) => achievement.id).sort()).toEqual(
            ['dicecities.mayor', 'dicecities.rich', 'dicecities.victor', 'platform.first-win']);
        expect(second).toEqual([]);
        expect(storedAchievementUnlocks()).toEqual(stored);
    });

    it('has exactly one of two concurrent turn ends report the unlock, and neither throw', async () => {
        const judged = catalogueOf([turnEnd('dicecities.rich', isRich)]);

        const results = await Promise.all([
            judgeTurnEnd(diceGame({ [ANN]: 99 }), TABLE, judged),
            judgeTurnEnd(diceGame({ [ANN]: 99 }), TABLE, judged),
        ]);

        expect(results.map(earned => earned.length).sort()).toEqual([0, 1]);
        expect(storedAchievementUnlocks()).toHaveLength(1);
    });

    it('has exactly one of two concurrent game ends report each unlock, and neither throw', async () => {
        recordsAre({ [ANN]: [tally('dicecities', 1, 1)] });

        const results = await Promise.all([
            judgeGameEnd(finishedGame('win'), TABLE, { recorded: true }, catalogue()),
            judgeGameEnd(finishedGame('win'), TABLE, { recorded: true }, catalogue()),
        ]);

        const reported = results.flat().map(({ userId, achievement }) => `${userId}:${achievement.id}`).sort();
        expect(reported).toEqual(['u1:dicecities.mayor', 'u1:dicecities.victor', 'u1:platform.first-win']);
        expect(storedAchievementUnlocks()).toHaveLength(3);
    });
});

describe('a check or a progress that throws', () => {
    const boom = () => { throw new Error('boom'); };

    it('costs only that achievement at a turn end, and says which one, in which game', async () => {
        const fine = turnEnd('dicecities.fine', () => true);

        const earned = await judgeTurnEnd(diceGame(), TABLE, catalogueOf([turnEnd('dicecities.broken', boom), fine]));

        expect(earned.map(({ achievement }) => achievement)).toEqual([fine, fine]);
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/dicecities\.broken.*g1/), expect.any(Error));
    });

    it('costs only that achievement at a game end', async () => {
        const fine = ending('dicecities.fine', () => true);
        recordsAre({ [ANN]: [tally('dicecities', 1, 1)] });

        const earned = await judgeGameEnd(finishedGame('win'), TABLE, { recorded: true }, catalogueOf([
            ending('dicecities.broken', boom),
            turnEnd('dicecities.broken-too', boom),
            fine,
            ownCareer('dicecities.broken-progress', boom, 1),
            ownCareer('dicecities.mayor', record => record.won, 1),
        ]));

        expect(earned.map(({ userId, achievement }) => `${userId}:${achievement.id}`).sort()).toEqual([
            'u1:dicecities.fine',
            'u1:dicecities.mayor',
            'u2:dicecities.fine',
        ]);
        expect(storedAchievementUnlocks().map(({ achievementId }) => achievementId)).not.toContain('dicecities.broken-progress');
    });
});
