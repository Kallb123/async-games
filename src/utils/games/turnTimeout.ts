import { IGameData, IGameDataDocument } from "../mongodb/GameData";
import { deserializeJSON } from "../apiModels/Serialisable";
import { IGameCommand, IGameType } from "../apiModels/gameCommand";
import { runCommand } from "./commandPipeline";
import { createAdapterRegistry } from "./adapterRegistry";
import { OutbreakAction, OutbreakDiscard, OutbreakEndTurn } from "@/games/Outbreak/OutbreakLogic";
import { IOutbreakGameData } from "@/games/Outbreak/OutbreakModels";
import { HAND_LIMIT } from "@/games/Outbreak/rules";

// docs/games/outbreak-gdd.md §21.2, gap 2: the turn-timer cron used to handle
// every game the same way — advance currentTurn and nothing else — which is
// wrong for a game whose board only deteriorates during a player's own turn.
// Skipping Outbreak's draw and infect phases for free makes timing out the
// strongest play at the table. A per-game adapter, in the style of
// registerReplayAdapter (replay.ts), tells the cron what "give up on this
// player's turn" means for a game that cares; a game that registers nothing
// keeps the old plain advance.

export interface ITurnTimeoutAdapter {
    className: string; // gameType.className
    /**
     * The next command needed to move `userId`'s stalled turn toward ending
     * it, given the game's current live state — e.g. forfeiting a still-open
     * action, or the command that runs the draw/infect phases once nothing is
     * left to forfeit. Called repeatedly by resolveStalledTurn, once per
     * command, until the turn ends, the game ends, or this returns null
     * because there's nothing left the game knows how to do automatically.
     *
     * senderId, senderUsername and gameId are filled in by the caller — an
     * adapter only decides which command to run next and with what
     * game-specific parameters.
     */
    buildTimeoutCommand(gameData: IGameData, userId: string): IGameCommand | null;
}

const adapters = createAdapterRegistry<ITurnTimeoutAdapter>();
export function registerTurnTimeoutAdapter(adapter: ITurnTimeoutAdapter) {
    adapters.register(adapter);
}
export function getTurnTimeoutAdapter(className: string): ITurnTimeoutAdapter | undefined {
    return adapters.get(className);
}

registerTurnTimeoutAdapter({
    className: "OutbreakGameType",
    // §21.6 step 6 already gives every phase of a turn a command that a live
    // player would send: forfeit a still-open action one at a time (the same
    // OutbreakAction a player bailing out early would submit), then
    // OutbreakEndTurn resolves the draw and infect phases from wherever the
    // turn was left — discarding down to the hand limit first, via
    // OutbreakDiscard, if the draw needs it. Nothing here touches
    // specificGameState directly; it only decides which of those commands
    // runs next.
    buildTimeoutCommand(gameData, userId) {
        const gs = (gameData as IOutbreakGameData).specificGameState;
        const ps = gs.players.get(userId);
        if (!ps) return null;

        if (gs.phase === 'discard') {
            const discard = new OutbreakDiscard();
            discard.cardIds = ps.hand.slice(0, ps.hand.length - HAND_LIMIT);
            return discard;
        }
        if (gs.phase !== 'actions') return null;
        if (ps.actionsLeft > 0) {
            const action = new OutbreakAction();
            action.kind = 'pass';
            return action;
        }
        return new OutbreakEndTurn();
    },
});

// A stalled turn should resolve in one sweep, not one command per ~15-minute
// cron tick — the missed-turn count sweepGame keeps per player would
// otherwise climb once per partial command (the timer never resets between
// them), abandoning the game long before anyone actually missed that many
// turns. This bounds a misbehaving adapter — one that never reaches
// turnOver — instead of looping forever; comfortably above any real game's
// per-turn command count.
const MAX_TIMEOUT_COMMANDS = 20;

export type TurnTimeoutOutcome =
    | 'noAdapter' // nothing registered for this game type — the cron falls back to its old plain advance
    | 'advanced' // the registered command(s) ran and ended the turn
    | 'gameOver' // one of them ended the whole game
    | 'stuck'; // registered, but couldn't make progress — left for the next sweep

/**
 * Forces `userId`'s stalled turn to its conclusion by constructing and
 * running their game's own commands through runCommand — the same pipeline
 * the command route and buildTimeline() already run a command through, so
 * nothing lands on the board that commandHistory can't account for. Mutates
 * `gameData` in place; the caller is responsible for persisting it.
 */
export async function resolveStalledTurn(
    gameData: IGameDataDocument,
    userId: string,
    senderUsername: string,
): Promise<TurnTimeoutOutcome> {
    const adapter = getTurnTimeoutAdapter(gameData.gameType.className);
    if (!adapter) return 'noAdapter';

    const gameType: IGameType = deserializeJSON(JSON.stringify(gameData.gameType));

    for (let i = 0; i < MAX_TIMEOUT_COMMANDS; i++) {
        const command = adapter.buildTimeoutCommand(gameData, userId);
        if (!command) return 'stuck';

        command.gameId = gameData.gameId;
        command.senderId = userId;
        command.senderUsername = senderUsername;

        const { outcome, gameOver } = await runCommand(gameData, gameType, command);
        if (!outcome.validMove) return 'stuck';

        gameData.markModified('gameState.commandHistory');

        if (gameOver) return 'gameOver';
        if (outcome.turnOver) return 'advanced';
    }

    return 'stuck';
}
