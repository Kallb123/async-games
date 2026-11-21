import { v4 as uuidv4 } from 'uuid';
import { deserializeJSON } from '@/utils/apiModels/Serialisable';
import type { IGameType } from '@/utils/apiModels/gameCommand';
import type { uuidString } from '@/utils/apiModels/GameDataApi';
import { IGameDataDocument, trySave } from '@/utils/mongodb/GameData';
import { gameCommandVersion } from '@/utils/ui/games';
import { runCommand } from '@/utils/games/commandPipeline';
import { COMPUTER_TURN_SEAT, getComputerTurnAdapter, isComputerTurn } from '@/utils/games/computerTurns';
import { hasAbandonedGame } from '@/utils/games/TurnTimer';
import { finishGame } from '@/utils/games/finishGame';
import { requireLiveGame } from '@/utils/games/liveGame';
import { announceTurnEnd } from '@/utils/games/announceTurnEnd';

/**
 * What a run of computer turns came to.
 *
 * - `handedBack`: the turn reached a player, who has been told (a solo player
 *   is not: they are watching) and whose turn-end achievements are judged.
 * - `gameOver`: the computer's turn ended the game, and it was finished and
 *   announced like any other.
 * - `stopped`: too close to `finishBy` to start another turn. Everything saved
 *   so far stands, and the turn-timer cron plays the rest (it is logged, so a
 *   game left for the backstop can be seen).
 * - `skipped`: nothing for this runner to do — the game has gone, has finished,
 *   or is no longer on a computer's seat, which means another runner (or the
 *   cron) got there first — or it kept losing its saves to one that did.
 * - `refused`: the game would not play the computer's turn (no command to
 *   build, its own rules called the move invalid, or running it threw). The
 *   failure was counted on the game (see `failComputerTurn`), which will try
 *   again once the turn has stood stale again.
 * - `abandoned`: that count reached `MAX_CONSECUTIVE_MISSED_TURNS`, so the game
 *   was ended as abandoned — nobody forfeited it — and announced.
 */
export type ComputerTurnsResult = 'handedBack' | 'gameOver' | 'stopped' | 'skipped' | 'refused' | 'abandoned';

/**
 * The time a computer's turn must have left before it is started, so that a
 * turn begun is a turn finished inside `finishBy`: the planner's guard (ten
 * seconds, `WARBAND_DEADLINE_MS`), the load and the save, a Clerk lookup,
 * `announceTurnEnd`'s achievement judging (five seconds) and the grace its push
 * is given (ten), and a reserve for a slow database on top. About thirty
 * seconds. (The command route hands its runner fifty from the request's start,
 * so the last turn it starts is begun at twenty.)
 */
export const COMPUTER_TURN_BUDGET_MS = 30_000;

/**
 * How long a computer's turn may have stood, as this run first found it, before
 * a solo player is pushed when it reaches them. A solo player watching the
 * board needs no push for a hand-off that took seconds; one whose warbands
 * waited for the backstop, or for a long run, has probably looked away. A bit
 * over the route runner's own lifetime (it is given a minute), because only a
 * turn that outlived that was finished by somebody else.
 */
export const COMPUTER_TURN_LONG_WAIT_MS = 60_000;

/**
 * How many lost saves one run puts up with. A lost save means another runner or
 * the cron moved the same game, and the run reloads to see whether the turn is
 * still a computer's; a game that keeps changing under it is somebody else's
 * to look after, and this must never loop for ever.
 */
export const MAX_COMPUTER_TURN_CONFLICTS = 3;

/**
 * Plays the computer's turns in a game, one after another, until the turn
 * reaches a player, the game ends, or there isn't time for another
 * (docs/games/realm-arena-hold-out.md §3). Called after the response that handed
 * the turn to the computer (the command route's `after()`) and by the
 * turn-timer cron, which finishes what a stopped runner left.
 *
 * Each turn is a command of the game's own, built by its adapter and stamped
 * here as the cron stamps `PlayerDropped`, and each is saved by itself, so a
 * runner that is stopped loses at most the turn in progress. The save is
 * `trySave`'s optimistic one, which is also what makes two runners at once
 * harmless: the loser reloads, finds the turn moved on, and leaves.
 *
 * `finishBy` is when the caller will be stopped (epoch ms). It never throws for
 * an ordinary failure; what it lets through is an unexpected one (Mongo down),
 * which its callers already catch.
 */
export async function playComputerTurns(gameId: string, { finishBy }: { finishBy: number }): Promise<ComputerTurnsResult> {
    let conflicts = 0;
    let game: IGameDataDocument | undefined;
    // When the turn the runner first found began; later saves move the document's
    // own timestamp, which would make a long run look like a short one.
    let waitingSince: number | undefined;

    for (;;) {
        if (finishBy - Date.now() < COMPUTER_TURN_BUDGET_MS) {
            console.warn(`Computer turns for game ${gameId} stopped short of time; the turn-timer cron plays the rest`);
            return 'stopped';
        }

        if (!game) {
            const found = await requireLiveGame(gameId);
            if ('error' in found) return 'skipped';
            game = found.game;
        }
        if (!isComputerTurn(game)) return 'skipped';
        waitingSince ??= new Date(game.lastTurnTimestamp).getTime();

        const command = getComputerTurnAdapter(game.gameType.className)?.buildCommand(game);
        if (!command) {
            console.error(`Game ${gameId} has no turn to play for ${game.currentTurn}`);
            return failComputerTurn(gameId, finishBy);
        }
        command.gameId = game.gameId as uuidString;
        command.version = gameCommandVersion(game.gameType);
        command.timestamp = new Date().toISOString();
        command.id = uuidv4() as uuidString;

        const gameType: IGameType = deserializeJSON(JSON.stringify(game.gameType));
        // Its own try, around the command alone: a move that throws is as
        // unplayable as one that is refused, and must be counted the same way.
        // Mongo going down, in the loads and saves around it, is not the game's
        // fault and still reaches the caller.
        let result: Awaited<ReturnType<typeof runCommand>>;
        try {
            result = await runCommand(game, gameType, command);
        } catch (error) {
            console.error(`The computer's turn for ${game.currentTurn} threw in game ${gameId}`, error);
            return failComputerTurn(gameId, finishBy);
        }
        const { outcome, gameOver } = result;
        if (!outcome.validMove) {
            console.error(`The computer's turn for ${game.currentTurn} was refused in game ${gameId}`);
            return failComputerTurn(gameId, finishBy);
        }
        game.markModified('gameState.commandHistory');
        // A turn that played ends any run of failures before it.
        game.missedTurnCounts?.delete(COMPUTER_TURN_SEAT);

        let saved: boolean;
        if (gameOver) {
            const finished = await finishGame(game, {
                winner: game.winner,
                endReason: game.endReason ?? 'win',
            });
            saved = finished.saved;
            if (saved) {
                await finished.announce({ finishBy });
                return 'gameOver';
            }
        } else {
            game.lastTurnTimestamp = new Date().toISOString();
            game.timerWarningNotificationSent = false;
            saved = await trySave(game);
        }

        if (!saved) {
            if (++conflicts > MAX_COMPUTER_TURN_CONFLICTS) return 'skipped';
            game = undefined;
            continue;
        }

        if (!isComputerTurn(game)) {
            // A solo player who just moved is watching the board, so a push
            // would only tell them what they are looking at; the turn end is
            // judged all the same.
            // A solo player is pushed only if the warbands kept them waiting.
            const waitedLong = Date.now() - waitingSince > COMPUTER_TURN_LONG_WAIT_MS;
            await announceTurnEnd(game, { push: game.userIdList.length > 1 || waitedLong });
            return 'handedBack';
        }
    }
}

/**
 * Counts a computer's turn that could not be played against the game, so one
 * that never can is not retried for ever. The failed attempt's document is
 * dropped with its half-applied state and the game reloaded, so what is saved
 * is the game as it was plus two changes: the count, keyed by the computer's
 * seat in `missedTurnCounts` as a player's missed turns are, and a fresh
 * `lastTurnTimestamp`, which takes the game out of the sweep's candidates until
 * its turn has stood stale again. At `MAX_CONSECUTIVE_MISSED_TURNS` the game is
 * ended as abandoned, with nobody to blame: the table is not at fault.
 */
async function failComputerTurn(gameId: string, finishBy: number): Promise<ComputerTurnsResult> {
    const found = await requireLiveGame(gameId);
    if ('error' in found || !isComputerTurn(found.game)) return 'skipped';
    const game = found.game;

    game.missedTurnCounts ??= new Map();
    const failures = (game.missedTurnCounts.get(COMPUTER_TURN_SEAT) ?? 0) + 1;
    game.missedTurnCounts.set(COMPUTER_TURN_SEAT, failures);

    if (hasAbandonedGame(failures)) {
        console.error(`Ending game ${gameId} as abandoned: the computer's turn failed ${failures} times in a row and can't be played`);
        const finished = await finishGame(game, { endReason: 'abandoned' });
        if (!finished.saved) return 'skipped';
        await finished.announce({ finishBy });
        return 'abandoned';
    }

    console.error(`The computer's turn in game ${gameId} has failed ${failures} time(s) in a row; trying again once it has stood stale`);
    game.lastTurnTimestamp = new Date().toISOString();
    return (await trySave(game)) ? 'refused' : 'skipped';
}
