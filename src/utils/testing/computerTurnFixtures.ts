// A computer's turn for the engine's tests that aren't about any one game
// (docs/games/realm-arena-hold-out.md §3): Snakes and Ladders with a seat of the
// computer's in its turn order, played by a fake warband command that does
// nothing but hand the turn on. The route, the runner and the cron are the real
// ones; only what the warbands *do* is stood in for, which is the game's own
// business and is covered with Realm Arena's own tests.
//
// Test-only: test files import it; app code never does.

import { v4 as uuidv4 } from 'uuid';
import { serializable } from '@/utils/apiModels/Serialisable';
import type { ICommandOutcome, IGameCommand } from '@/utils/apiModels/GameLogic';
import type { uuidString } from '@/utils/apiModels/GameDataApi';
import type { IGameData } from '@/utils/mongodb/GameData';
import type { ISnakesAndLaddersGameData } from '@/games/SnakesAndLadders/SnakesAndLaddersModels';
import { registerComputerTurnAdapter } from '@/utils/games/computerTurns';

/** What a fake warband's turn hands the turn to, in place of a player: the game ends. */
export const ENDS_THE_GAME = 'the-game-ends';

/**
 * Called as the runner sets about each warband turn, once the game is loaded and
 * before it is saved — where a test slips in a rival runner's save (bump the
 * stored version) or its hand-off (move the stored `currentTurn`). Cleared by
 * `registerFakeWarbands`.
 */
export const warbandHooks: { onTurn?: (turn: number) => void } = {};

/**
 * How many warband turns the runner has set about since `registerFakeWarbands`.
 * Counted when the command is built, not when it executes: a replay (the
 * "your turn" push is built from one) executes the recorded commands again.
 */
export const warbandTurnsRun = { count: 0 };

/**
 * One warband's turn: hands the turn to `handTo` and answers `turnOver: false`,
 * so the game's own `CheckEndTurn` leaves that hand-off where this put it.
 */
@serializable
export class FakeWarbandTurn implements IGameCommand {
    id = uuidv4() as uuidString;
    timestamp = new Date().toISOString();
    gameId = 'game_1' as uuidString;
    senderId = 'Unknown';
    senderUsername = 'Warband';
    readonly className = 'FakeWarbandTurn';
    version?: number;
    handTo = '';

    myString() { return 'took its turn'; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        if (this.handTo === ENDS_THE_GAME) {
            const squares = (gameData as ISnakesAndLaddersGameData).specificGameState.playerPositions;
            for (const state of squares.values()) state.position = 100;
        } else {
            gameData.currentTurn = this.handTo;
        }
        return { validMove: true, turnOver: false };
    }
}

/**
 * Registers the fake adapter for Snakes and Ladders: each seat of the
 * computer's hands the turn to the seat `hands` names for it — another seat of
 * its own, a player, or `ENDS_THE_GAME`.
 */
export function registerFakeWarbands(hands: Record<string, string>) {
    warbandTurnsRun.count = 0;
    delete warbandHooks.onTurn;
    registerComputerTurnAdapter({
        className: 'SnakesAndLaddersGameType',
        buildCommand(gameData) {
            const handTo = hands[gameData.currentTurn];
            if (handTo === undefined) return null;
            warbandTurnsRun.count++;
            warbandHooks.onTurn?.(warbandTurnsRun.count);
            const command = new FakeWarbandTurn();
            command.senderId = gameData.currentTurn;
            command.handTo = handTo;
            return command;
        },
    });
}
