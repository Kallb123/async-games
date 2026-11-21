// A computer's turn for the engine's tests that aren't about any one game
// (docs/games/realm-arena-hold-out.md §3): Snakes and Ladders with the
// computer's seat (`COMPUTER_TURN_SEAT`) in its turn order, played by a fake warband command that does
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
import { COMPUTER_TURN_SEAT, registerComputerTurnAdapter } from '@/utils/games/computerTurns';

/** What a fake warband's turn hands the turn to, in place of a player: the game ends. */
export const ENDS_THE_GAME = 'the-game-ends';

/** In place of a hand-off: the turn's command is refused as an invalid move. */
export const IS_REFUSED = 'the-turn-is-refused';

/** In place of a hand-off: the turn's command throws out of its Execute. */
export const THROWS = 'the-turn-throws';

/** Where the computer's turn stays, for the next of its turns to play. */
export const STAYS_WITH_COMPUTER = COMPUTER_TURN_SEAT;

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
        if (this.handTo === THROWS) throw new Error('the warband fell over');
        if (this.handTo === IS_REFUSED) return { validMove: false, turnOver: false };
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
 * Registers the fake adapter for Snakes and Ladders: the computer's n-th turn
 * (counted off the turns already on the record, so a turn that was dropped
 * unsaved is played again) hands the turn to `hands[n]` — the computer's seat
 * again, a player, `ENDS_THE_GAME`, or a failure (`IS_REFUSED`, `THROWS`). A
 * game with no entry left has no turn to play.
 */
export function registerFakeWarbands(hands: string[]) {
    warbandTurnsRun.count = 0;
    delete warbandHooks.onTurn;
    registerComputerTurnAdapter({
        className: 'SnakesAndLaddersGameType',
        buildCommand(gameData) {
            const history = gameData.gameState.commandHistory as { className: string }[];
            const played = history.filter(command => command.className === 'FakeWarbandTurn').length;
            const handTo = hands[played];
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
