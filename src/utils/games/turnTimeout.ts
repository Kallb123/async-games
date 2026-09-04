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
    // docs/games/fires-out-gdd.md §17.2 gaps 2 and 3: 'endTurn' is the whole of
    // "give up on this turn" here, and there is nothing to decide between. It
    // is the only command that runs §7's Advance Fire and Replenish POI — so
    // the plain advance let a stalled player skip the fire entirely — and the
    // only one that moves activeFirefighter in step with currentTurn, so the
    // plain advance also deadlocked the game outright. Unlike Outbreak, no
    // turn can be left mid-phase and every action is optional, so one command
    // always finishes the job; a timeout therefore banks unspent AP exactly as
    // the deliberate pass of §8's design note does, and pays the same price by
    // resolving the fire. resolveStalledTurn re-asks until turnOver, which is
    // what owes a player holding two figures (§1's solitaire play) one fire
    // advance per figure rather than one for the lot.
    buildTimeoutCommand(gameData, userId) {
        const gs = (gameData as IFiresOutGameData).specificGameState;
        // ...with one bound on that re-asking: if every figure on the board is
        // this player's, no number of endTurns reaches a different owner, so
        // turnOver never comes and the cap below becomes the exit rather than
        // the backstop — a tick's worth of real Advance Fires either thrown
        // away with 'stuck' or, worse, saved as a teamloss the fire only
        // caused because the cron rolled it twenty times. Unreachable while
        // every seat holds exactly one figure, which is every game that can be
        // created today (MIN_PLAYERS is 2, and buildInitialFiresOutState makes
        // one figure per seat); §1's solitaire play, plan step 12, is what will
        // make it ordinary. Declining is the whole answer, and 'declined' is
        // the answer the caller wants: it banks the missed turn against
        // MAX_CONSECUTIVE_MISSED_TURNS and ends the game on the third one, the
        // same as any other game its player walked away from — so a turn only
        // its owner can take is left for its owner to take, but not forever.
        if (gs.firefighters.every(ff => ff.ownerId === userId)) return null;

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
    | 'declined' // the game had nothing it could run for this turn, and nothing did run
    | 'stuck'; // command(s) ran and the turn still didn't end — an adapter bug, not a game shape

/**
 * Whether an unresolved turn left the game as it found it. This is the
 * distinction the caller needs, because it decides whether the half-finished
 * turn is worth keeping:
 *
 * `declined` is a turn the game says it cannot resolve automatically — Fires
 * Out's board where every figure belongs to the stalled player, Outbreak's
 * currentTurn missing from its own player map — decided before anything ran,
 * so the only thing dirty on the document is the caller's own missed-turn
 * count. The cron banks that and leaves the turn where it is; three of them
 * and the abandon ladder ends the game like any other its player walked away
 * from.
 *
 * `stuck` is a turn where commands *did* run and it still didn't end: an
 * adapter that ran out of the command budget below, or whose command came
 * back invalid part-way through. That is a bug in the adapter rather than a
 * shape of game, and half a resolved turn is not worth persisting — the
 * caller drops the document unsaved and the next tick starts over, which is
 * what the budget comment above is guarding against ("a tick's worth of real
 * Advance Fires ... saved as a teamloss the fire only caused because the cron
 * rolled it twenty times").
 */
function unresolved(commandsAccepted: number): TurnTimeoutOutcome {
    return commandsAccepted === 0 ? 'declined' : 'stuck';
}

/**
 * Forces `userId`'s stalled turn to its conclusion by constructing and
 * running their game's own commands through runCommand — the same pipeline
 * the command route and buildTimeline() already run a command through, so
 * nothing lands on the board that commandHistory can't account for. Mutates
 * `gameData` in place; the caller is responsible for persisting it — and for
 * *not* persisting it on 'stuck', which is what keeps a half-resolved turn out
 * of the database (see `unresolved` above).
 */
export async function resolveStalledTurn(
    gameData: IGameDataDocument,
    userId: string,
    senderUsername: string,
): Promise<TurnTimeoutOutcome> {
    const adapter = getTurnTimeoutAdapter(gameData.gameType.className);
    if (!adapter) return 'noAdapter';

    const gameType: IGameType = deserializeJSON(JSON.stringify(gameData.gameType));

    let accepted = 0;
    for (let i = 0; i < MAX_TIMEOUT_COMMANDS; i++) {
        const command = adapter.buildTimeoutCommand(gameData, userId);
        if (!command) return unresolved(accepted);

        command.gameId = gameData.gameId;
        command.senderId = userId;
        command.senderUsername = senderUsername;

        const { outcome, gameOver } = await runCommand(gameData, gameType, command);
        // A refused command is recorded nowhere (commandPipeline), so nothing
        // it may have touched on the way to refusing is accounted for either.
        // With nothing accepted before it that is still 'declined': the only
        // such refusal any adapter here reaches is a game whose currentTurn
        // and own turn marker are out of step, where Execute's ownerId guard
        // returns before doing anything but Fires Out's idempotent board
        // migration (growBoardToCurrentLayout).
        if (!outcome.validMove) return unresolved(accepted);

        accepted++;
        gameData.markModified('gameState.commandHistory');

        if (gameOver) return 'gameOver';
        if (outcome.turnOver) return 'advanced';
    }

    return 'stuck';
}
