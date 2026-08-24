import { IGameData } from "../mongodb/GameData";
import { IGameCommand, IGameType, ICommandOutcome } from "../apiModels/GameLogic";
import { deserializeJSON } from "../apiModels/Serialisable";
import { buildInitialSnakesAndLaddersState, gameStateToModel as snakesAndLaddersStateToModel, ISnakesAndLaddersGameData } from "@/games/SnakesAndLadders/SnakesAndLaddersModels";
import { buildInitialDiceCitiesState, gameStateToModel as diceCitiesStateToModel } from "@/games/DiceCities/DiceCitiesModels";
import { buildInitialSmartthinkState, gameStateToModel as smartthinkStateToModel } from "@/games/Smartthink/SmartthinkModels";
import { buildInitialSettlementsAndCitiesState, gameStateToResponse as settlementsAndCitiesStateToModel } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import { ISettlementsAndCitiesGameData } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import { buildInitialWorldDominationState, gameStateToResponse as worldDominationStateToModel, IWorldDominationGameData } from "@/games/WorldDomination/WorldDominationModels";
import { buildInitialTrainTimeStateFromGameData, gameStateToModel as trainTimeStateToModel, ITrainTimeGameData } from "@/games/TrainTime/TrainTimeModels";
// Side-effect import: evaluating GameLogic registers every @serializable command
// class so deserializeJSON can rehydrate them during replay.
import "../apiModels/GameLogic";

// A single point on a game's timeline: the reconstructed (response-shaped) state
// after zero or more commands have been applied. Index 0 is the initial state.
export interface ITurnSnapshot {
    index: number;
    // Response-shaped specificGameState (same shape the game page already renders).
    specificGameState: unknown;
    currentTurn: string;
    complete: boolean;
    winner: string;
    // Newest-first history log up to and including this point.
    history: string[];
    // Metadata about the command that produced this snapshot (null for the initial state).
    command: {
        senderId: string;
        senderUsername: string;
        timestamp: string;
        summary: string;
    } | null;
    // True when this snapshot is a hypothetical planned move (beyond real history).
    planned: boolean;
}

export interface ITimeline {
    // Index into `snapshots` of the real, current live state.
    currentIndex: number;
    snapshots: ITurnSnapshot[];
    // Planned commands with their RNG outcomes resolved/recorded, so the client can
    // resend them and keep earlier planned rolls stable while adding new ones.
    resolvedPlannedCommands: unknown[];
}

// One applied step of the replay, surfaced to an optional observer. Unlike the
// public ITurnSnapshot (response-shaped, sent to the client), a step also carries
// the rehydrated command instance (with its recorded RNG) and its outcome, so
// server-side consumers like the recap engine can read game-specific details
// without re-running the pipeline themselves.
export interface IReplayStep {
    prev: ITurnSnapshot;
    next: ITurnSnapshot;
    command: IGameCommand;
    outcome: ICommandOutcome;
    planned: boolean;
}

// A per-game adapter tells the generic engine how to (a) build the deterministic
// initial state and (b) convert mongo-shaped state to the response shape the UI
// renders. All game rules themselves are reused via each command's Execute().
export interface IReplayAdapter {
    className: string; // gameType.className
    // Builds the deterministic starting specificGameState. Receives the full
    // persisted gameData so it can read static creation-time fields (e.g.
    // Smartthink's solo secret code) that never change during play.
    buildInitialSpecificGameState(gameData: IGameData): unknown;
    // `viewerId` is the player the snapshots are being built for, or null when
    // nobody in particular is asking. Games whose state is the same for
    // everybody ignore it; a game with hidden information (Train Time's hand
    // and tickets) shapes that player's own secrets — and only theirs — in.
    toResponseState(
        specificGameState: unknown,
        userIdNameMap: { [key: string]: string },
        viewerId: string | null,
    ): unknown;
    // Which of this game's commands may be run as a *planned* (hypothetical)
    // move. Required, with no default, so a new game has to make the call that
    // new-game.md §7 asks for rather than inheriting one.
    //
    // Empty means planning is off, and that is the right answer for every game
    // that hasn't built a planning UI. See plannableCommands() below for why
    // this is the control rather than `canPlan`.
    plannableCommands: string[];
}

const adapters: Record<string, IReplayAdapter> = {};
export function registerReplayAdapter(adapter: IReplayAdapter) {
    adapters[adapter.className] = adapter;
}
export function getReplayAdapter(className: string): IReplayAdapter | undefined {
    return adapters[className];
}

// The command classNames a game will run as part of a planned turn — the
// server-side half of planning, and the half that matters.
//
// Planning replays client-supplied hypothetical commands against the game's
// *real* reconstructed state, so a command that consumes a deck or reads another
// player's hidden state answers exactly the question the live game is keeping
// from the planner: plan a draw and you are told the card on top of the real
// deck. That is what the deck freeze in docs/turn-recap-and-planning.md is —
// a game names the commands whose outcome is deterministic or memoryless, and
// planning never runs the rest.
//
// `canPlan` on TurnNavControls decides what the UI *offers*; this decides what
// the server will *run*. Only the second is a control — the timeline route is a
// plain authenticated POST, so a game whose board sets `canPlan={false}` is not
// thereby protected from a planned command sent by hand.
//
// A game with no replay adapter at all (Solitaire) plans nothing, same as a game
// that declares an empty list.
export function plannableCommands(gameTypeClassName: string): string[] {
    return getReplayAdapter(gameTypeClassName)?.plannableCommands ?? [];
}

registerReplayAdapter({
    className: "SnakesAndLaddersGameType",
    // The re-roll house rule is fixed at creation, so reading it off the live
    // state reproduces the rule the recorded rolls were actually played under.
    buildInitialSpecificGameState: (gameData) => buildInitialSnakesAndLaddersState(
        gameData.userIdList,
        (gameData as ISnakesAndLaddersGameData).specificGameState?.reRollOnSix === true,
    ),
    toResponseState: (specificGameState, userIdNameMap) =>
        snakesAndLaddersStateToModel(specificGameState as never, userIdNameMap),
    // The pilot, and still the only game with a planning UI. Its one command
    // rolls a die, which is memoryless — a hypothetical roll is statistically
    // identical to the real one and there is no deck to read.
    plannableCommands: ["SnakesAndLaddersRequestDiceRoll"],
});

registerReplayAdapter({
    className: "DiceCitiesGameType",
    buildInitialSpecificGameState: (gameData) => buildInitialDiceCitiesState(gameData.userIdList),
    toResponseState: (specificGameState, userIdNameMap) =>
        diceCitiesStateToModel(specificGameState as never, userIdNameMap),
    // Nothing about the game blocks planning — no deck, no shuffle, no
    // redaction — but no planning UI has been built, and the safe set is a
    // decision for whoever builds it. Off until then.
    plannableCommands: [],
});

registerReplayAdapter({
    className: "SettlementsAndCitiesGameType",
    buildInitialSpecificGameState: (gameData) =>
        buildInitialSettlementsAndCitiesState(gameData as ISettlementsAndCitiesGameData),
    toResponseState: (specificGameState, userIdNameMap) =>
        settlementsAndCitiesStateToModel(specificGameState as never, userIdNameMap),
    // Deck freeze is feasible here but unbuilt. Note for whoever builds it that
    // SACBuyDevCard is not the only command to leave out: SACMoveRobber samples
    // a real resource out of the victim's hand, and SACPlayMonopoly reads how
    // much of a resource every player is holding.
    plannableCommands: [],
});

registerReplayAdapter({
    className: "WorldDominationGameType",
    buildInitialSpecificGameState: (gameData) => buildInitialWorldDominationState(gameData as IWorldDominationGameData),
    toResponseState: (specificGameState, userIdNameMap) =>
        worldDominationStateToModel(specificGameState as never, userIdNameMap),
    // Deck freeze is feasible here but unbuilt: battle dice are memoryless and
    // the only deck contact is the end-of-turn draw in riskEndTurn, reached
    // only via WorldDominationFortify / WorldDominationSkipFortify.
    plannableCommands: [],
});

registerReplayAdapter({
    className: "TrainTimeGameType",
    buildInitialSpecificGameState: (gameData) => buildInitialTrainTimeStateFromGameData(gameData as ITrainTimeGameData),
    toResponseState: (specificGameState, userIdNameMap, viewerId) =>
        trainTimeStateToModel(specificGameState as never, userIdNameMap, viewerId),
    // Deck freeze is feasible here but unbuilt. Two things to weigh first: the
    // draw commands are the obvious exclusions, but ClaimRoute and PassTurn can
    // *end the game* through finishTurn, and this game's DTO reveals every
    // player's tickets once gs.gameOver is set.
    plannableCommands: [],
});

registerReplayAdapter({
    className: "SmartthinkGameType",
    buildInitialSpecificGameState: (gameData) =>
        buildInitialSmartthinkState((gameData as unknown as { specificGameState: never }).specificGameState),
    toResponseState: (specificGameState, userIdNameMap) =>
        smartthinkStateToModel(specificGameState as never, userIdNameMap),
    // Out by design, and permanently: SmartthinkSubmitGuess scores against the
    // real secret code, so a planned guess returns real feedback. There is no
    // randomness to freeze and a decoy would score against a fake code, which
    // teaches the player nothing.
    plannableCommands: [],
});

// Reconstructs a game's full timeline by replaying its recorded commandHistory
// from a fresh initial state, then optionally applying hypothetical planned
// commands on top. Mirrors the command route's per-command pipeline
// (Execute -> CheckGameOver -> CheckEndTurn) but never persists or notifies.
export async function buildTimeline(
    gameData: IGameData,
    userIdNameMap: { [key: string]: string },
    plannedCommands: IGameCommand[] = [],
    // Optional observer invoked once per applied command (real or planned) with
    // the surrounding snapshots plus the command/outcome. Additive: existing
    // callers that only want the snapshots can ignore it.
    onStep?: (step: IReplayStep) => void,
    // Who the snapshots are for, when the game keeps per-player secrets — see
    // IReplayAdapter.toResponseState. Null builds the everybody-can-see-it view.
    viewerId: string | null = null
): Promise<ITimeline> {
    const adapter = getReplayAdapter(gameData.gameType.className);
    if (!adapter) {
        throw new Error(`No replay adapter registered for ${gameData.gameType.className}`);
    }

    const gameType: IGameType = deserializeJSON(JSON.stringify(gameData.gameType));

    // A fresh, in-memory game document we mutate as we replay. specificGameState
    // is game-specific (added by each discriminator), so we widen the base type.
    type ReplayState = IGameData & { specificGameState: unknown };
    const state: ReplayState = {
        gameId: gameData.gameId,
        gameType,
        userIdList: [...gameData.userIdList],
        turnTimer: gameData.turnTimer,
        currentTurn: gameData.gameState.turnOrder[0] ?? "",
        lastTurnTimestamp: gameData.lastTurnTimestamp,
        timerWarningNotificationSent: false,
        missedTurnCounts: new Map(),
        gameState: {
            turnOrder: [...gameData.gameState.turnOrder],
            history: [],
            commandHistory: [],
        },
        complete: false,
        winner: "",
        specificGameState: adapter.buildInitialSpecificGameState(gameData),
    };

    const snapshots: ITurnSnapshot[] = [];
    let index = 0;
    const snapshot = (command: IGameCommand | null, planned: boolean) => {
        snapshots.push({
            index: index++,
            specificGameState: adapter.toResponseState(state.specificGameState, userIdNameMap, viewerId),
            currentTurn: state.currentTurn,
            complete: state.complete,
            winner: state.winner,
            history: [...state.gameState.history],
            command: command
                ? {
                      senderId: command.senderId,
                      senderUsername: command.senderUsername,
                      timestamp: command.timestamp,
                      summary: command.myString(),
                  }
                : null,
            planned,
        });
    };

    // Initial state.
    snapshot(null, false);

    // Applies an ordered list of raw commands, snapshotting after each. Returns
    // true if the game ended part-way through.
    const applyCommands = async (
        rawCommands: unknown[],
        planned: boolean,
        resolvedOut: unknown[] | null
    ): Promise<boolean> => {
        for (const raw of rawCommands) {
            const command: IGameCommand = deserializeJSON(JSON.stringify(raw));
            // Every command was executed on its sender's turn.
            state.currentTurn = command.senderId;
            const outcome = await command.Execute(state);
            if (!outcome.validMove) {
                continue;
            }
            state.gameState.commandHistory.push(command);
            if (resolvedOut) {
                resolvedOut.push(command);
            }
            if (gameType.CheckGameOver(state)) {
                snapshot(command, planned);
                onStep?.({
                    prev: snapshots[snapshots.length - 2],
                    next: snapshots[snapshots.length - 1],
                    command,
                    outcome,
                    planned,
                });
                return true;
            }
            gameType.CheckEndTurn(state, outcome);
            snapshot(command, planned);
            onStep?.({
                prev: snapshots[snapshots.length - 2],
                next: snapshots[snapshots.length - 1],
                command,
                outcome,
                planned,
            });
        }
        return false;
    };

    const gameOver = await applyCommands(gameData.gameState.commandHistory ?? [], false, null);
    const currentIndex = snapshots.length - 1;

    // Creation-time setup entries (e.g. the turn-order roll-off) predate
    // commandHistory, so replaying can't regenerate them. Commands unshift newer
    // entries in front, so the setup entries are the persisted history's tail
    // beyond what the replayed commands produced. Append them to every snapshot
    // so the setup steps stay visible throughout recap/planning.
    const persistedHistory = gameData.gameState.history ?? [];
    const setupHistory = persistedHistory.slice(state.gameState.history.length);

    const resolvedPlannedCommands: unknown[] = [];
    if (!gameOver && plannedCommands.length) {
        await applyCommands(plannedCommands, true, resolvedPlannedCommands);
    }

    if (setupHistory.length) {
        snapshots.forEach((s) => s.history.push(...setupHistory));
    }

    return { currentIndex, snapshots, resolvedPlannedCommands };
}

// Replays a game via buildTimeline, recording a cumulative per-player stat at
// the end of each turn - the series a per-turn line chart plots (e.g. Dice
// Cities' coins/turn, Settlements & Cities' resources/turn - see each game's
// GAME_RESULT_STATS entry in GameResultData.ts for the actual field being
// tracked). Usernames aren't resolved yet at game-end (recordGameResult only
// has userIds), matching the compute-by-userId / format-by-username split
// every other game's result stats already use, so an arbitrary (identity)
// userIdNameMap is enough - extractValue is expected to look players up by
// their `.userId` field regardless of how the map keyed them.
export async function computePerTurnStat<TState>(
    gameData: IGameData,
    extractValue: (state: TState, userId: string) => number | undefined,
): Promise<Map<string, number>[]> {
    const identityMap = Object.fromEntries(gameData.userIdList.map(userId => [userId, userId]));
    const perTurn: Map<string, number>[] = [];
    try {
        await buildTimeline(gameData, identityMap, [], (step) => {
            if (!step.outcome.turnOver) {
                return;
            }
            const responseState = step.next.specificGameState as TState;
            const entry = new Map<string, number>();
            for (const userId of gameData.userIdList) {
                entry.set(userId, extractValue(responseState, userId) ?? 0);
            }
            perTurn.push(entry);
        });
    } catch (error) {
        // A snapshot-replay game created before its snapshot existed can't be
        // replayed at all (see docs/turn-recap-and-planning.md). This runs on
        // the last move of a game, inside recordGameResult, so throwing here
        // would cost the player their final turn to lose a chart nobody has
        // seen yet. Downgrade to no series — the same graceful no-op recap
        // already makes for those games — but say so, since the other way to
        // land here is a genuinely broken adapter.
        console.warn(`No per-turn stat for game ${gameData.gameId}: ${error}`);
        return [];
    }
    return perTurn;
}
