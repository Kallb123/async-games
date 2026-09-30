// Judging: who has just earned what, at the two points the server already runs.
// The design is docs/achievements.md; §4.2 is `judgeTurnEnd` and §4.3 is
// `judgeGameEnd`, which share the helpers below.
//
// **This file is server-only.** It pulls in the replay registry, which is every
// game's Models, and Mongoose. Nothing that ships to the browser may import it,
// which is why the shapes and the pure record helpers live in achievements.ts
// instead, the file the profile bundles.
//
// It never fetches anything *for* an achievement (§4.1). At each checkpoint it
// gathers what that moment knows (the game as the table sees it, the result, the
// player's record) and hands each criterion exactly the slice its type takes: a
// match check a view and a seat, a career `progress` a record. So an achievement
// can't ask for more than its kind allows, and nothing below reaches into one.

import type { User } from "@clerk/nextjs/server";
import { ACHIEVEMENT_CATALOGUE, careerMet, careerRecord, withoutThisGame } from "./achievements";
import type {
    Achievement,
    AchievementCatalogue,
    GameAchievement,
    MatchCriteria,
    PlatformAchievement,
} from "./achievements";
import { getReplayAdapter, identityNameMap } from "./replay";
import { gameLength } from "./turnCount";
import { AchievementUnlockModel, recordUnlocks } from "@/utils/mongodb/AchievementUnlockData";
import type { IAchievementUnlockData, UnlockToRecord } from "@/utils/mongodb/AchievementUnlockData";
import type { IGameData } from "@/utils/mongodb/GameData";
import { countsAsPlayed, endedByHand, getGameStatsByPlayer, matchResultOf, outcomeFor, resultCounts } from "@/utils/mongodb/GameResultData";
import { unclaimedGuestsOf } from "@/utils/users/guest";

/** How long each checkpoint waits for judging (§4.2, §4.3). Callers wrap the judge in `withTimeout` with these. */
export const TURN_END_BUDGET_MS = 5_000;
export const GAME_END_BUDGET_MS = 3_000;

/** One unlock a judging pass just stored, new and not already held, for the player who earned it. */
export interface EarnedAchievement {
    userId: string;
    achievement: Achievement;
}

/**
 * What a judge answers with when it has nothing to say, and what `withTimeout`
 * falls back to when one can't answer in time. Frozen, so nobody can push onto
 * the one list every caller shares.
 */
export const NO_UNLOCKS: readonly EarnedAchievement[] = Object.freeze([]);

// ─── The view a check is given ───────────────────────────────────────────────

// A match achievement of each kind, narrowed so the judge can call its check
// without re-reading `criteria` at every use. `any` for the same reason the
// catalogue has it: only the game's own file knows its response type.
type TurnEndAchievement = GameAchievement<any> & { criteria: Extract<MatchCriteria<any>, { at: "turnEnd" }> };
type EndAchievement = GameAchievement<any> & { criteria: Extract<MatchCriteria<any>, { at: "end" }> };

const isTurnEnd = (achievement: GameAchievement<any>): achievement is TurnEndAchievement =>
    achievement.criteria.kind === "match" && achievement.criteria.at === "turnEnd";
const isEnd = (achievement: GameAchievement<any>): achievement is EndAchievement =>
    achievement.criteria.kind === "match" && achievement.criteria.at === "end";
const isCareer = (achievement: GameAchievement<any>): boolean => achievement.criteria.kind === "career";

/**
 * The game as everyone at the table sees it (§9): the game's own response
 * builder, asked for a viewer who holds no seat.
 *
 * **This is the only way a check's view is built, and it has no viewer
 * parameter.** The `null` below is the guarantee §9 rests on: a check that
 * passes can only have read what the whole table can already see, so an unlock,
 * announced mid-game to a phone and a profile, tells nobody anything the board
 * didn't. Passing the seat's own id instead would hand a check that seat's
 * hand. Nobody should "fix" a check that never fires by loosening it, which is
 * why there is nothing to pass (§15, row 12). awardAchievements.test.ts pins it
 * against a game that redacts by viewer.
 *
 * Built from the live document, not replayed, and the command history is given
 * so a game whose response says something about the sequence (Settlements &
 * Cities' `canUndo`) can. Synchronous, so it can't interleave with the save
 * beside it.
 *
 * Throws for a game with no replay adapter (Solitaire). The catalogue's own
 * test refuses a match achievement for such a game, so reaching here is a bug,
 * and a loud one is better than a check that silently never runs.
 */
export function tableView(gameData: IGameData): unknown {
    const { className, url } = gameData.gameType;
    const adapter = getReplayAdapter(className);
    if (!adapter) {
        throw new Error(`No replay adapter registered for ${className}, so there is no table view of ${url} to judge`);
    }
    // Checks look a player up by userId, never by name, so the names that would
    // be resolved from Clerk can be the ids themselves.
    return adapter.toResponseState(
        (gameData as IGameData & { specificGameState: unknown }).specificGameState,
        identityNameMap(gameData.userIdList),
        null, // load-bearing: see above. Never a viewer.
        gameData.gameState.commandHistory,
    );
}

// ─── What both checkpoints share ─────────────────────────────────────────────

/** This game's own achievements, or none for a game with no achievements.ts. */
function gameAchievements(catalogue: AchievementCatalogue, url: string): GameAchievement<any>[] {
    return Object.hasOwn(catalogue.games, url) ? catalogue.games[url] : [];
}

/**
 * The seats to judge, or none when the table doesn't count (steps 1 and 2).
 *
 * The table counts only if nobody at it is an unclaimed guest, the same rule as
 * a stats row (`resultCounts`, docs/account-less-play.md §8). **It fails
 * closed**: a seat whose id `userList` doesn't hold counts as an unclaimed
 * guest. The stale-guest sweeper can delete a guest who is still seated (§15),
 * and `usersById` then leaves them out without a word, so an exhibition table
 * would otherwise look registered, and everyone at it would earn from a game
 * that counts toward nobody's stats (§10).
 *
 * Every seat is judged, not only the mover, because a move can hand somebody
 * else their achievement (Dice Cities' Business Center swap). The exception is a
 * player the game dropped for going quiet.
 */
function judgedSeats(gameData: IGameData, userList: User[]): string[] {
    const resolved = new Set(userList.map(user => user.id));
    const unclaimed = [
        ...unclaimedGuestsOf(userList).unclaimedPlayerIds,
        ...gameData.userIdList.filter(userId => !resolved.has(userId)),
    ];
    if (!resultCounts(unclaimed)) return [];
    const dropped = gameData.gameState.droppedPlayers ?? [];
    return gameData.userIdList.filter(userId => !dropped.includes(userId));
}

/** What each seat already holds, by achievement id. */
type Held = Map<string, Set<string>>;

/**
 * What the seats already hold of the candidates (step 3): one read, served by
 * the unique { userId, achievementId } index. Projected to the two fields,
 * because nothing else about a row is wanted here.
 */
async function heldBy(seats: string[], candidates: readonly Achievement[]): Promise<Held> {
    const rows: Pick<IAchievementUnlockData, "userId" | "achievementId">[] = await AchievementUnlockModel
        .find(
            { userId: { $in: seats }, achievementId: { $in: candidates.map(achievement => achievement.id) } },
            { userId: 1, achievementId: 1 },
        )
        .lean()
        .exec();
    const held: Held = new Map(seats.map(userId => [userId, new Set()]));
    for (const { userId, achievementId } of rows) held.get(userId)?.add(achievementId);
    return held;
}

/** The candidates this seat doesn't hold yet. */
function lacking<A extends Achievement>(held: Held, userId: string, candidates: readonly A[]): A[] {
    return candidates.filter(achievement => !held.get(userId)?.has(achievement.id));
}

/** An unlock that belongs to this game: stored with its id and its url (§5.1). */
function earnedIn(gameData: IGameData, userId: string, achievement: Achievement): UnlockToRecord {
    return { userId, achievementId: achievement.id, gameId: gameData.gameId, url: gameData.gameType.url };
}

/**
 * Runs every match achievement a seat lacks, and answers an unlock for each
 * whose check passes (step 5). `passes` makes the call, because what a check is
 * handed differs by kind and that is for the caller to say.
 *
 * Each check is in its own `try`: a broken one costs only that achievement, for
 * this pass, with a warning that names it and the game (§10). A check is typed
 * to return a boolean and never to throw, but it is a game author's code running
 * in a route's `after()`, beside a push that must still go out.
 */
function matchUnlocks<A extends Achievement>(
    gameData: IGameData,
    seats: string[],
    held: Held,
    achievements: readonly A[],
    passes: (achievement: A, userId: string) => boolean,
): UnlockToRecord[] {
    const unlocks: UnlockToRecord[] = [];
    for (const userId of seats) {
        for (const achievement of lacking(held, userId, achievements)) {
            try {
                if (passes(achievement, userId)) unlocks.push(earnedIn(gameData, userId, achievement));
            } catch (error) {
                console.warn(`Achievement ${achievement.id}: its check threw in game ${gameData.gameId}; counting it as not earned.`, error);
            }
        }
    }
    return unlocks;
}

/**
 * Stores what was earned (step 6) and answers which of it was new.
 *
 * `unlockedAt` is this judge's own clock and never the timestamp of the command
 * that ended the turn: Settlements & Cities deliberately gives its follow-up
 * end-turn a fresh one so nothing pairs it with the move that triggered it, and
 * an unlock shouldn't undo that.
 *
 * `recordUnlocks` hands back only the rows it actually inserted, so a player
 * who already held one, or whose other pass won the race, isn't told twice
 * (§5.2). Those rows are mapped back to their achievements through the
 * candidates this pass was judging, which is every id it could have written.
 *
 * A row with no game is a backfilled career unlock (§4.3): it is stored, and it
 * isn't this game's to announce, so it is left out of the answer.
 */
async function store(unlocks: UnlockToRecord[], candidates: readonly Achievement[]): Promise<EarnedAchievement[]> {
    const inserted = await recordUnlocks(unlocks, new Date().toISOString());
    const byId = new Map(candidates.map(achievement => [achievement.id, achievement]));
    return inserted.flatMap(({ userId, achievementId, gameId }) => {
        const achievement = byId.get(achievementId);
        return gameId !== undefined && achievement ? [{ userId, achievement }] : [];
    });
}

// ─── The end of a turn (§4.2) ────────────────────────────────────────────────

/**
 * Judges this game's `turnEnd` match achievements after a move has ended a turn,
 * for every seat, on the live game. Answers what this pass newly unlocked, for
 * the caller to push (§4.2).
 *
 * Callers wrap it in `withTimeout` with `TURN_END_BUDGET_MS`. It doesn't throw
 * for a check that does; a failed read or write may reject, which that wrapper
 * logs and answers `NO_UNLOCKS` for. `userList` is the roster the route already
 * resolved from Clerk.
 */
export async function judgeTurnEnd(
    gameData: IGameData,
    userList: User[],
    catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE,
): Promise<readonly EarnedAchievement[]> {
    // Step 0, before any read and before anything derived from Clerk's answer.
    const turnEnd = gameAchievements(catalogue, gameData.gameType.url).filter(isTurnEnd);
    if (turnEnd.length === 0) return NO_UNLOCKS;

    const seats = judgedSeats(gameData, userList);
    if (seats.length === 0) return NO_UNLOCKS;

    const held = await heldBy(seats, turnEnd);
    // A seat holding all of them is done. The view is built once, and only if
    // somebody is left to judge.
    if (!seats.some(userId => lacking(held, userId, turnEnd).length > 0)) return NO_UNLOCKS;

    const view = tableView(gameData);
    return store(
        matchUnlocks(gameData, seats, held, turnEnd, (achievement, userId) => achievement.criteria.check(view, { userId })),
        turnEnd,
    );
}

// ─── The end of a game (§4.3) ────────────────────────────────────────────────

/**
 * The career achievements this game's ending unlocked, per seat (§4.3).
 *
 * A seat is skipped if it already holds every one, which is the usual case for
 * a heavy player and how they avoid a full-history aggregation every time a
 * table they sit at finishes. Otherwise the record is read, narrowed to this
 * game when only this game's own are missing (the platform's need every game),
 * and each seat is in its own `try`: one seat's failed aggregation costs only
 * that seat, who catches up at their next game.
 *
 * Each achievement a seat lacks that its record now meets is stored, and then
 * sorted by whether this game is what tipped it. Met on the record without this
 * game too means it was already true, as it is for every veteran at launch, so
 * it is *backfilled*: stored without a game, because this game didn't earn it.
 * Otherwise it is *tipped*, and is stored with this game. The judge for each is
 * `careerMet` over a catalogue of only what the seat lacks, so a game's own is
 * judged on its `GameRecord` and the platform's on the whole career, by the one
 * rule the profile uses.
 */
async function careerUnlocks(
    gameData: IGameData,
    seats: string[],
    held: Held,
    ownCareer: readonly GameAchievement<any>[],
    platformCareer: readonly PlatformAchievement[],
): Promise<UnlockToRecord[]> {
    const slug = gameData.gameType.url;
    // "DiceCities", which a record read is narrowed by, not the url slug that the
    // record is keyed by.
    const storedGameType = gameData.gameType.gameType;
    const result = matchResultOf(gameData);
    const played = countsAsPlayed(gameData);
    const perSeat = await Promise.all(seats.map(async (userId): Promise<UnlockToRecord[]> => {
        const lackingOwn = lacking(held, userId, ownCareer);
        const lackingPlatform = lacking(held, userId, platformCareer);
        if (lackingOwn.length === 0 && lackingPlatform.length === 0) return [];
        try {
            const byGame = lackingPlatform.length === 0
                ? await getGameStatsByPlayer(userId, storedGameType)
                : await getGameStatsByPlayer(userId);
            const career = careerRecord(byGame);
            const toJudge: AchievementCatalogue = { games: { [slug]: lackingOwn }, platform: lackingPlatform };
            const metNow = careerMet(career, toJudge);
            if (metNow.length === 0) return [];
            const before = new Set(
                careerMet(withoutThisGame(career, slug, { played, won: outcomeFor(result, userId) === "win" }), toJudge).map(achievement => achievement.id),
            );
            return metNow.map(achievement => before.has(achievement.id)
                ? { userId, achievementId: achievement.id }
                : earnedIn(gameData, userId, achievement));
        } catch (error) {
            console.warn(`Achievements: no career judging for ${userId} in game ${gameData.gameId}; it catches up at their next game.`, error);
            return [];
        }
    }));
    return perSeat.flat();
}

/**
 * Judges a game as it ends, for every seat, and answers what this game's ending
 * unlocked, per player. That is exactly what the game-over push names, and what
 * the results page lists for the game. A backfilled career unlock is stored but
 * is not in the answer, because this game didn't earn it.
 *
 * - **Match**, on a rules ending only: every `turnEnd` achievement a seat still
 *   lacks, once more on the final view, and every `end` achievement, which is
 *   the one place a check learns the result. The `turnEnd` ones are handed only
 *   `{ userId }`, as at a turn end, so they answer the same at both.
 * - **Career**, however the game ended, but only once its result is recorded
 *   (`context.recorded`): the record is read from `GameResult`, and a player's
 *   record that doesn't include this game yet would get ahead of the stats
 *   beside it. A failed record catches up at the player's next game.
 *
 * It has its own "anything to judge?" and its own "done" (§4.3), because
 * `judgeTurnEnd`'s are about `turnEnd` achievements only, and would skip career
 * and `end` judging for any game without any, which is every game until it has
 * a catalogue of its own.
 *
 * Callers wrap it in `withTimeout` with `GAME_END_BUDGET_MS`. It doesn't throw
 * for a check or a `progress` that does, or for a seat whose record can't be
 * read; a failed read of what they hold, or a failed write, may reject.
 */
export async function judgeGameEnd(
    gameData: IGameData,
    userList: User[],
    context: { recorded: boolean },
    catalogue: AchievementCatalogue = ACHIEVEMENT_CATALOGUE,
): Promise<readonly EarnedAchievement[]> {
    const own = gameAchievements(catalogue, gameData.gameType.url);
    // A match achievement reads what the rules decided, so it is judged only on a
    // rules ending: a surrender or an abandonment is a state somebody chose (§4.1).
    const matches: (TurnEndAchievement | EndAchievement)[] = endedByHand(gameData.endReason)
        ? []
        : [...own.filter(isTurnEnd), ...own.filter(isEnd)];
    const ownCareer = context.recorded ? own.filter(isCareer) : [];
    const platformCareer = context.recorded ? catalogue.platform : [];

    // Step 0, before any read and before anything derived from Clerk's answer.
    if (matches.length === 0 && ownCareer.length === 0 && platformCareer.length === 0) return NO_UNLOCKS;

    const seats = judgedSeats(gameData, userList);
    if (seats.length === 0) return NO_UNLOCKS;

    const candidates = [...matches, ...ownCareer, ...platformCareer];
    const held = await heldBy(seats, candidates);

    const result = matchResultOf(gameData);
    const turns = gameLength(gameData.gameState.commandHistory, gameData.userIdList.length).count;

    const unlocks: UnlockToRecord[] = [];

    // The view is built only if a seat still lacks a match achievement, and if it
    // can't be, the career half below still runs.
    if (seats.some(userId => lacking(held, userId, matches).length > 0)) {
        try {
            const view = tableView(gameData);
            unlocks.push(...matchUnlocks(gameData, seats, held, matches, (achievement, userId) =>
                achievement.criteria.at === "turnEnd"
                    ? achievement.criteria.check(view, { userId })
                    : achievement.criteria.check(view, { userId, outcome: outcomeFor(result, userId), turns })));
        } catch (error) {
            console.warn(`Achievements: no table view of game ${gameData.gameId}; its match achievements aren't judged.`, error);
        }
    }

    unlocks.push(...await careerUnlocks(gameData, seats, held, ownCareer, platformCareer));
    return store(unlocks, candidates);
}
