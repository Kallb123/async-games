import { IGameData, IGameDataDocument } from "../mongodb/GameData";
import { deserializeJSON } from "../apiModels/Serialisable";
import { IGameCommand, IGameType } from "../apiModels/gameCommand";
import { runCommand } from "./commandPipeline";
import { createAdapterRegistry } from "./adapterRegistry";
import { OutbreakAction, OutbreakDiscard, OutbreakEndTurn, OutbreakPlayEvent } from "@/games/Outbreak/OutbreakLogic";
import { IOutbreakGameData } from "@/games/Outbreak/OutbreakModels";
import { HAND_LIMIT } from "@/games/Outbreak/rules";
import { FiresOutAction } from "@/games/FiresOut/FiresOutLogic";
import { IFiresOutGameData } from "@/games/FiresOut/FiresOutModels";

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
    //
    // §21.6 step 10 added a fourth phase a stalled turn can be left in:
    // 'forecast', if the player played Forecast and then went quiet before
    // submitting an order — nobody else can, since a forecastOrder must come
    // from currentTurn. Resolved with the identity order (the 6 cards go back
    // exactly as drawn): a forced resolution shouldn't invent the strategy a
    // real player would have applied.
    buildTimeoutCommand(gameData, userId) {
        const gs = (gameData as IOutbreakGameData).specificGameState;
        const ps = gs.players.get(userId);
        if (!ps) return null;

        if (gs.phase === 'forecast') {
            const order = new OutbreakPlayEvent();
            order.kind = 'forecastOrder';
            order.cardIds = [...gs.forecastCards];
            return order;
        }
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

registerTurnTimeoutAdapter({
    className: "FiresOutGameType",
    // docs/games/fires-out-gdd.md §17.2 gap 2 and §17.6 step 1: Fires Out needs
    // this for the same reason Outbreak does, only harder. The plain advance
    // would move currentTurn on without touching specificGameState, and that
    // breaks two ways at once:
    //
    //   1. The fire never advances. §7 Phase 2 and Phase 3 — Advance Fire and
    //      Replenish POI — only happen inside an 'endTurn' command, so a turn
    //      the cron skips is a turn the building doesn't burn, which makes
    //      going quiet the strongest play at the table (§17.2 gap 2).
    //   2. The game deadlocks. §17.2 gap 3: the engine's turn belongs to a
    //      player (currentTurn) but this game's belongs to a figure
    //      (activeFirefighter), and only CheckEndTurn keeps the two in step.
    //      Advancing one without the other leaves the new currentTurn player
    //      rejected by Execute's `ff.ownerId !== senderId` guard and everyone
    //      else rejected by the command route's currentTurn check — nobody can
    //      move at all.
    //
    // So there is no skip action to write: 'endTurn' is already the whole of
    // "give up on this turn". It is the same command a player with nothing
    // worth doing sends by hand — §8's design note on AP banking is explicit
    // that passing to fund a bigger turn later is a real move — so a timeout
    // banks unspent AP exactly as a deliberate pass does, and pays the same
    // price for it by resolving the fire. Nothing here needs to know which of
    // §8's eleven actions the player left unfinished: unlike Outbreak, a Fires
    // Out turn has no mid-turn phase that must be closed off first, and every
    // action is optional, so one command always finishes the job.
    //
    // resolveStalledTurn keeps calling this until turnOver, which is what
    // hands a player controlling more than one pawn (§1's solitaire play) one
    // Advance Fire per figure rather than one for the lot.
    buildTimeoutCommand(gameData, userId) {
        const gs = (gameData as IFiresOutGameData).specificGameState;
        const ff = gs.firefighters[gs.activeFirefighter];
        // Whoever the cron timed out has to be the figure that's up, or the
        // command would only be rejected by the same Execute guard. The two
        // are in step from buildInitialFiresOutState onward and CheckEndTurn
        // moves them together, so this is the deadlock in case 2 above having
        // already happened — a game no player can move either. Reporting
        // 'stuck' leaves it to the missed-turn count to abandon rather than
        // quietly rewriting whose turn it is.
        if (!ff || ff.ownerId !== userId) return null;

        const action = new FiresOutAction();
        action.kind = 'endTurn';
        return action;
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
