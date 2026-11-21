import { v4 as uuidv4 } from 'uuid';
import { deserializeJSON } from '@/utils/apiModels/Serialisable';
import type { IGameType } from '@/utils/apiModels/gameCommand';
import type { uuidString } from '@/utils/apiModels/GameDataApi';
import { IGameDataDocument, trySave } from '@/utils/mongodb/GameData';
import { gameCommandVersion } from '@/utils/ui/games';
import { runCommand } from '@/utils/games/commandPipeline';
import { getComputerTurnAdapter, isComputerTurn } from '@/utils/games/computerTurns';
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
 *   so far stands, and the turn-timer cron plays the rest.
 * - `skipped`: nothing for this runner to do — the game has gone, has finished,
 *   or is no longer on a computer's seat, which means another runner (or the
 *   cron) got there first — or it kept losing its saves to one that did.
 * - `refused`: the game would not play the computer's turn (no command to
 *   build, or its own rules called the move invalid). Nothing was saved.
 */
export type ComputerTurnsResult = 'handedBack' | 'gameOver' | 'stopped' | 'skipped' | 'refused';

/**
 * The time a computer's turn must have left before it is started. The planner
 * stops between actions after ten seconds (`WARBAND_DEADLINE_MS`), and the save
 * and a hand-off to a player (push, judging) come after that, so this is
 * comfortably more: a turn that began is a turn that finishes inside `finishBy`.
 */
export const COMPUTER_TURN_BUDGET_MS = 15_000;

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

    for (;;) {
        if (finishBy - Date.now() < COMPUTER_TURN_BUDGET_MS) return 'stopped';

        if (!game) {
            const found = await requireLiveGame(gameId);
            if ('error' in found) return 'skipped';
            game = found.game;
        }
        if (!isComputerTurn(game)) return 'skipped';

        const command = getComputerTurnAdapter(game.gameType.className)?.buildCommand(game);
        if (!command) {
            console.error(`Game ${gameId} has no turn to play for ${game.currentTurn}`);
            return 'refused';
        }
        command.gameId = game.gameId as uuidString;
        command.version = gameCommandVersion(game.gameType);
        command.timestamp = new Date().toISOString();
        command.id = uuidv4() as uuidString;

        const gameType: IGameType = deserializeJSON(JSON.stringify(game.gameType));
        const { outcome, gameOver } = await runCommand(game, gameType, command);
        if (!outcome.validMove) {
            // The document is dropped with its half-applied state; nothing is
            // saved, so the next tick of the cron meets the same game as it was.
            console.error(`The computer's turn for ${game.currentTurn} was refused in game ${gameId}`);
            return 'refused';
        }
        game.markModified('gameState.commandHistory');

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
            // A solo player just moved and is watching the board, so a push
            // would only tell them what they are looking at (an End turn pushes
            // nobody today); the turn end is judged all the same.
            await announceTurnEnd(game, { push: game.userIdList.length > 1 });
            return 'handedBack';
        }
    }
}
