import { IGameData } from "../mongodb/GameData";
import { UNKNOWN_PLAYER_NAME } from "../ui/players";
import { IHistoryEntry, resolveHistory, resolveTokens, toTheMinute } from "./history";
import { commandVersion, IGameCommand, IGameType, ICommandOutcome, recordedOnTurnOf, recordedTurnStartedAt } from "../apiModels/GameLogic";
import { replayableCommandVersions } from "../ui/games";
import type { GameResultEvent } from "../apiModels/GameDataApi";
import { deserializeJSON } from "../apiModels/Serialisable";
import { isRecordedFollowUpOf, runCommand } from "./commandPipeline";
import { createAdapterRegistry } from "./adapterRegistry";
import { playedOnTurnOf } from "./turnCount";
import { buildInitialSnakesAndLaddersState, gameStateToModel as snakesAndLaddersStateToModel, ISnakesAndLaddersGameData } from "@/games/SnakesAndLadders/SnakesAndLaddersModels";
import { buildInitialDiceCitiesState, gameStateToModel as diceCitiesStateToModel, IDiceCitiesGameData } from "@/games/DiceCities/DiceCitiesModels";
import { LEGACY_BANK_TOTAL_COINS } from "@/games/DiceCities/cards";
import { buildInitialSmartthinkState, gameStateToModel as smartthinkStateToModel } from "@/games/Smartthink/SmartthinkModels";
import { buildInitialSettlementsAndCitiesState, gameStateToResponse as settlementsAndCitiesStateToModel } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import { ISettlementsAndCitiesGameData } from "@/games/SettlementsAndCities/SettlementsAndCitiesModels";
import { sacUnrecordedHoldEnd } from "@/games/SettlementsAndCities/SettlementsAndCitiesLogic";
import type { ISACSpecificGameState } from "@/games/SettlementsAndCities/board";
import { buildInitialWorldDominationState, gameStateToResponse as worldDominationStateToModel, IWorldDominationGameData } from "@/games/WorldDomination/WorldDominationModels";
import { buildInitialTrainTimeStateFromGameData, gameStateToModel as trainTimeStateToModel, ITrainTimeGameData } from "@/games/TrainTime/TrainTimeModels";
import { buildInitialOutbreakStateFromGameData, gameStateToModel as outbreakStateToModel, IOutbreakGameData } from "@/games/Outbreak/OutbreakModels";
import { buildInitialBannedIsletStateFromGameData, gameStateToModel as bannedIsletStateToModel, IBannedIsletGameData } from "@/games/BannedIslet/BannedIsletModels";
import { buildInitialFiresOutStateFromGameData, gameStateToModel as firesOutStateToModel, IFiresOutGameData } from "@/games/FiresOut/FiresOutModels";
import { buildInitialRaceCarsStateFromGameData, gameStateToModel as raceCarsStateToModel, IRaceCarsGameData } from "@/games/RaceCars/RaceCarsModels";
import { buildInitialRealmArenaState, gameStateToModel as realmArenaStateToModel, stepOutcomeToModel as realmArenaStepOutcome, IRealmArenaGameData } from "@/games/RealmArena/RealmArenaModels";
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
    // Newest-first history log up to and including this point, with every
    // player token already resolved to a name (see utils/games/history.ts).
    history: IHistoryEntry[];
    // Metadata about the command that produced this snapshot (null for the initial state).
    command: {
        senderId: string;
        senderUsername: string;
        timestamp: string;
        summary: string;
    } | null;
    // True when this snapshot is a hypothetical planned move (beyond real history).
    planned: boolean;
    // What the command behind this snapshot did, for a game whose adapter opts
    // in (IReplayAdapter.snapshotOutcome). Absent otherwise, and on the
    // initial state.
    outcome?: unknown;
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
    // `commandHistory` is this point in the replay's own log — every command
    // applied so far, oldest first — for a game whose response has to say
    // something about the *sequence* rather than just the state (Settlements &
    // Cities' `canUndo`, which is only true while the snapshot on top of the
    // undo stack is still the last thing that happened). Most games ignore it.
    toResponseState(
        specificGameState: unknown,
        userIdNameMap: { [key: string]: string },
        viewerId: string | null,
        commandHistory: IGameCommand[],
        // Whether the game this state is from has finished. Only a game with
        // something that may be told once the game is over, and not before
        // (Settlements & Cities' `hasHeldWool`), reads it. Most games ignore it.
        complete?: boolean,
    ): unknown;
    // Which of this game's commands may be run as a *planned* (hypothetical)
    // move. Required, with no default, so a new game has to make the call that
    // new-game.md §7 asks for rather than inheriting one.
    //
    // Empty means planning is off, and that is the right answer for every game
    // that hasn't built a planning UI. See plannableCommands() below for why
    // this is the control rather than `canPlan`.
    plannableCommands: string[];
    // Optional, for a game that holds a turn open for its undo window
    // (docs/undo.md §5) and had games under way before it did. There, the
    // move that holds today ended the turn outright, so the recorded log goes
    // straight on without the command that closes a hold. Replayed as it is,
    // that hold never closes: the next move is refused, then every move after
    // it, and the match review and the result charts stop following the game
    // a turn or two in. Asked before each recorded command, handed the state,
    // whose turn it is and that command: return the command that closes the
    // hold (the replay sends it as the player holding it) when the recorded
    // one is something the hold wouldn't have let through, or null.
    closeUnrecordedHold?(specificGameState: unknown, holderId: string, next: IGameCommand): IGameCommand | null;
    // Optional: what of a command's outcome goes on the snapshot after it, for
    // a game whose board plays what each step did, which the difference
    // between two states can't show (a miss changes nothing). Off unless a game
    // opts in, since an outcome is built for the player who sent the command:
    // it's asked for `viewerId` — the timeline's viewer, as toResponseState is
    // — with the game's state after the command and whether that ended it, so
    // a game whose outcomes say things some viewer may not see (Realm Arena's
    // fog of war) shapes what each one is told. Never asked of a planned
    // command, whose outcome is resolved against the real game.
    snapshotOutcome?(outcome: ICommandOutcome, viewerId: string | null, specificGameState: unknown, complete: boolean): unknown;
}

const adapters = createAdapterRegistry<IReplayAdapter>();
export function registerReplayAdapter(adapter: IReplayAdapter) {
    adapters.register(adapter);
}
export function getReplayAdapter(className: string): IReplayAdapter | undefined {
    return adapters.get(className);
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
    // The Docks, the coin supply and the theme are all fixed at creation, so
    // replaying a game restocks the same market, deals from the same bank and
    // names every card the way the recorded commands were actually played
    // against. A game saved before the supply matched the boxed game has no
    // stored total and gets the one it had; one saved before themes existed
    // has no stored theme and gets the game as it shipped.
    buildInitialSpecificGameState: (gameData) => {
        const played = (gameData as IDiceCitiesGameData).specificGameState;
        return buildInitialDiceCitiesState(
            gameData.userIdList,
            played?.enabledDocks === true,
            played?.bankTotal ?? LEGACY_BANK_TOTAL_COINS,
            played?.theme,
        );
    },
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
    // canUndo needs the anchor to still match the tail of commandHistory, not
    // just the stack's own owner — see gameStateToResponse's lastCommandId.
    toResponseState: (specificGameState, userIdNameMap, viewerId, commandHistory, complete) =>
        settlementsAndCitiesStateToModel(specificGameState as never, userIdNameMap, viewerId, commandHistory.at(-1)?.id ?? null, complete),
    // Deck freeze is feasible here but unbuilt. Note for whoever builds it that
    // SACBuyDevCard is not the only command to leave out: SACMoveRobber samples
    // a real resource out of the victim's hand, and SACPlayMonopoly reads how
    // much of a resource every player is holding.
    plannableCommands: [],
    closeUnrecordedHold: (specificGameState, holderId, next) =>
        sacUnrecordedHoldEnd(specificGameState as ISACSpecificGameState, holderId, next),
});

registerReplayAdapter({
    className: "WorldDominationGameType",
    buildInitialSpecificGameState: (gameData) => buildInitialWorldDominationState(gameData as IWorldDominationGameData),
    toResponseState: (specificGameState, userIdNameMap, viewerId) =>
        worldDominationStateToModel(specificGameState as never, userIdNameMap, viewerId),
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
    className: "OutbreakGameType",
    buildInitialSpecificGameState: (gameData) => buildInitialOutbreakStateFromGameData(gameData as IOutbreakGameData),
    // canUndo needs the anchor to still match the tail of commandHistory, not
    // just the stack's own owner — see gameStateToModel's lastCommandId.
    toResponseState: (specificGameState, userIdNameMap, viewerId, commandHistory) =>
        outbreakStateToModel(specificGameState as never, userIdNameMap, viewerId, commandHistory.at(-1)?.id ?? null),
    // The crew planner is §21.6 step 13, not this one — deck freeze is
    // feasible (only OutbreakEndTurn touches a deck) but no planning UI
    // exists yet, so this stays empty until that step turns it on.
    plannableCommands: [],
});

registerReplayAdapter({
    className: "BannedIsletGameType",
    buildInitialSpecificGameState: (gameData) => buildInitialBannedIsletStateFromGameData(gameData as IBannedIsletGameData),
    // canUndo needs the anchor to still match the tail of commandHistory, not
    // just the stack's own owner — see gameStateToModel's lastCommandId.
    toResponseState: (specificGameState, userIdNameMap, viewerId, commandHistory) =>
        bannedIsletStateToModel(specificGameState as never, userIdNameMap, viewerId, commandHistory.at(-1)?.id ?? null),
    // docs/games/banned-islet.md §21.5: the route planner is a PR of its own
    // and needs the cross-player opt-in that doesn't exist yet, so nothing is
    // plannable here. When it does arrive, BannedIsletAction is the whole safe
    // set under deck freeze — BannedIsletEndTurn and BannedIsletDiscard are the
    // only commands that touch a deck, and a planned draw would read the top of
    // the real flood deck, which is the one thing this game is about not
    // knowing.
    plannableCommands: [],
});

registerReplayAdapter({
    className: "FiresOutGameType",
    buildInitialSpecificGameState: (gameData) => buildInitialFiresOutStateFromGameData(gameData as IFiresOutGameData),
    // canUndo needs the anchor to still match the tail of commandHistory, not
    // just the stack's own owner — see gameStateToModel's lastCommandId.
    toResponseState: (specificGameState, userIdNameMap, viewerId, commandHistory) =>
        firesOutStateToModel(specificGameState as never, userIdNameMap, viewerId, commandHistory.at(-1)?.id ?? null),
    // §17.5: both deck freeze and decoy are feasible — the d6/d8 are
    // memoryless and the POI pool's remaining composition is already public
    // — but no planning UI exists yet (steps 13/14). Empty until then.
    plannableCommands: [],
});

registerReplayAdapter({
    className: "RaceCarsGameType",
    buildInitialSpecificGameState: (gameData) => buildInitialRaceCarsStateFromGameData(gameData as IRaceCarsGameData),
    // canUndo needs the anchor to still match the tail of commandHistory, not
    // just the stack's own owner — see gameStateToModel's lastCommandId
    // (docs/undo.md §7).
    toResponseState: (specificGameState, userIdNameMap, viewerId, commandHistory) =>
        raceCarsStateToModel(specificGameState as never, userIdNameMap, viewerId, commandHistory.at(-1)?.id ?? null),
    // Out by design, and permanently (docs/games/race-cars.md §23.5) — the
    // second of these, after Smartthink's. A planned shift would resolve one
    // hypothetical roll and show the driver a board they will not get: the
    // decision this game asks for is which *band* to bet on, not where a made-up
    // number lands, and the reach band ships instead of a planner. And the
    // timeline route deliberately does not strip recorded randomness — planned
    // commands are a player's own hypotheticals, never saved — so this list is,
    // in that route's own words, the only enforcement point. Adding
    // RaceCarsShift here would accept
    // `{"className":"RaceCarsShift","gear":5,"recordedRoll":20}` and resolve it
    // against the live game's real state, letting a driver choose their own die.
    plannableCommands: [],
});

registerReplayAdapter({
    className: "RealmArenaGameType",
    // From scratch (docs/games/realm-arena.md §17.3 PR 8): nothing is shuffled,
    // the seat order is the only randomness in setup and it is persisted as
    // `turnOrder`, and every 1–100 roll a battle uses is recorded on the
    // `RealmArenaAct` that used it. The ranks the battle was created with are
    // read back from the live state, which never changes them (§23.3), so a
    // muster is checked against the ranks it was checked against then, and
    // whether it's fought in fog of war likewise (§27).
    buildInitialSpecificGameState: (gameData) => buildInitialRealmArenaState(
        gameData.gameState.turnOrder,
        (gameData as IRealmArenaGameData).specificGameState.mastery ?? {},
        (gameData as IRealmArenaGameData).specificGameState.fog === true,
    ),
    // The sealed muster holds in a replay as it does live (§17.2): a snapshot
    // taken before the last player has mustered carries the viewer's own squad
    // and nobody else's, and a null viewer's carries none at all.
    // canUndo needs the anchor to still match the tail of commandHistory, not
    // just the stack's own owner — see gameStateToModel's lastCommandId.
    // So does fog of war (§27): each snapshot is what the viewer's squad saw
    // then, and a null viewer, with no squad, sees nobody until the battle is
    // over.
    toResponseState: (specificGameState, _userIdNameMap, viewerId, commandHistory, complete) =>
        realmArenaStateToModel(specificGameState as never, viewerId, commandHistory.at(-1)?.id ?? null, complete),
    // What each action and End turn did, so a review can play it (§26.2): a
    // miss changes nothing in the state. See stepOutcomeToModel for what each
    // viewer is told of it in fog of war.
    snapshotOutcome: (outcome, viewerId, specificGameState, complete) =>
        realmArenaStepOutcome(outcome, viewerId, specificGameState as never, complete),
    // Out by design: every attack worth planning needs a roll, and a planned
    // one would show a player a board they won't get. Nor is the hit chance
    // it would teach them anything the turn sheet doesn't already show before
    // they commit (§17.3 PR 7). And the timeline route leaves recorded rolls in
    // a planned command, so adding RealmArenaAct here would let a player pick
    // their own `recordedRolls` and resolve them against the real battle.
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

/**
 * Refuses, by throwing, a game whose recorded log holds a command this server
 * can't replay faithfully (docs/command-versions.md): one older than its
 * game's `oldestReplayableCommandVersion`, whose rules have since been
 * dropped, or one newer than the game's current version, recorded by a
 * release this server isn't running. Replaying either would run the move under
 * rules it was never played by, and quietly show a game that never happened —
 * every caller already treats a timeline that can't be built as a recap or a
 * chart it goes without.
 */
function assertReplayable(gameData: IGameData): void {
    const { oldest, newest } = replayableCommandVersions(gameData.gameType);
    for (const raw of gameData.gameState.commandHistory ?? []) {
        const version = commandVersion(raw);
        if (version < oldest || version > newest) {
            const className = (raw as { className?: string } | null)?.className;
            throw new Error(`Game ${gameData.gameId} holds a ${className} recorded at command version ${version}, outside the ${oldest}–${newest} this server replays`);
        }
    }
}

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
    // callers that only want the snapshots can ignore it. The second argument
    // is the internal specificGameState that step left behind — unredacted,
    // every player's hand, and mutated in place by the next step, so read what
    // you need from it there and then. For a server-side game-end stat only
    // (see computePerTurnInternalStats); it never goes near a snapshot or a
    // response.
    onStep?: (step: IReplayStep, specificGameState: unknown) => void,
    // Who the snapshots are for, when the game keeps per-player secrets — see
    // IReplayAdapter.toResponseState. Null builds the everybody-can-see-it view.
    viewerId: string | null = null,
): Promise<ITimeline> {
    const adapter = getReplayAdapter(gameData.gameType.className);
    if (!adapter) {
        throw new Error(`No replay adapter registered for ${gameData.gameType.className}`);
    }

    assertReplayable(gameData);

    const gameType: IGameType = deserializeJSON(JSON.stringify(gameData.gameType));

    // The names history tokens resolve to. Today's directory first, exactly as
    // the live board uses it — and for a player it can no longer name, the last
    // name this game recorded for them, for the same reason the command loop
    // below keeps one: a guest swept seven days after their last game
    // (GUEST_SWEEP_DAYS) should still be "Dave" in the recap of a game they
    // played, not "Unknown player".
    const historyNames = { ...userIdNameMap };
    (gameData.gameState.commandHistory ?? []).forEach((raw) => {
        const command = raw as { senderId?: string, senderUsername?: string } | null;
        if (!command?.senderId || !command.senderUsername) return;
        const known = historyNames[command.senderId];
        if (!known || known === UNKNOWN_PLAYER_NAME) {
            historyNames[command.senderId] = command.senderUsername;
        }
    });

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
    const snapshot = (command: IGameCommand | null, planned: boolean, outcome?: ICommandOutcome) => {
        const told = outcome && !planned ? adapter.snapshotOutcome?.(outcome, viewerId, state.specificGameState, state.complete) : undefined;
        snapshots.push({
            index: index++,
            specificGameState: adapter.toResponseState(state.specificGameState, userIdNameMap, viewerId, state.gameState.commandHistory, state.complete),
            currentTurn: state.currentTurn,
            complete: state.complete,
            winner: state.winner,
            history: resolveHistory(state.gameState.history, historyNames),
            // Tokenised the same way a history line is (see userToken /
            // resolveTokens, utils/games/history.ts), so a command's
            // myString() can name a player without needing a userIdNameMap
            // of its own.
            command: command
                ? {
                      senderId: command.senderId,
                      senderUsername: command.senderUsername,
                      timestamp: toTheMinute(command.timestamp),
                      summary: resolveTokens(command.myString(), historyNames),
                  }
                : null,
            planned,
            ...(told !== undefined ? { outcome: told } : {}),
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
        for (let index = 0; index < rawCommands.length; index++) {
            const raw = rawCommands[index];
            const command: IGameCommand = deserializeJSON(JSON.stringify(raw));
            // senderUsername is the name recorded on the command when it was
            // played, and it titles this move in every recap this replay feeds.
            // Prefer today's name, so one that has since changed — or a guest's
            // random account username, stamped by a client that predates the
            // server doing it — isn't read back verbatim forever. historyNames
            // above already encodes that preference, recorded name and all.
            command.senderUsername = historyNames[command.senderId] ?? command.senderUsername;
            // A hold the recorded log never closed, because the game was played
            // before it held turns (IReplayAdapter.closeUnrecordedHold) — closed
            // here, as its holder, before the command that moved on from it.
            // Asked before `currentTurn` is put back to this command's, since
            // while a hold is open the turn is still its holder's. Never for a
            // planned command: a plan is today's rules.
            const closeHold = planned ? null : adapter.closeUnrecordedHold?.(state.specificGameState, state.currentTurn, command);
            if (closeHold) {
                closeHold.gameId = command.gameId;
                closeHold.senderId = state.currentTurn;
                closeHold.version = command.version;
                const closed = await runCommand(state, gameType, closeHold);
                if (closed.outcome.validMove) {
                    // Those rules ended the turn inside the move that holds it
                    // today, with no command and no line of its own, so this
                    // leaves neither — and no step: what it did is part of the
                    // next one. Only its own lines go (the pipeline stamps them
                    // with its id), not what the hand-off itself wrote, which
                    // the game wrote too; the history has to stay the length the
                    // game kept, or the creation-time lines sliced off its tail
                    // below would come up short.
                    state.gameState.commandHistory.pop();
                    state.gameState.history = state.gameState.history.filter(line => line.commandId !== closeHold.id);
                } else {
                    console.warn(`Replay of game ${gameData.gameId} couldn't close a hold its log never closed; ${command.className} is likely refused next`);
                }
            }
            // Every command was executed on its sender's turn — except one
            // played out of turn, which ran on the turn of the player it names
            // (docs/out-of-turn-actions.md §5.4). Putting `currentTurn` back
            // to that, rather than to the sender, is what lets its Execute
            // tell it was out of turn the same way it did live, and keeps the
            // snapshot after it naming the player who really held the turn.
            // Replay then runs it under the same invariants the live route
            // did. Only a recorded command's stamp counts: a planned one is
            // whatever the planner's client sent, and plans the planner's own
            // turn.
            const onTurnOf = planned ? undefined : recordedOnTurnOf(command);
            state.currentTurn = onTurnOf ?? command.senderId;
            // The turn clock goes back to the one the command ran against, too.
            // The live clock also moves where this log can't follow it — the
            // turn-timer cron's plain advance steps the turn on and restarts
            // the clock without running a command — and a game whose undo
            // entries are clocked (utils/games/undo.ts) reads that as a hold
            // closing. Without this, a hold the cron passed on round the table
            // and back to its owner replayed as still open, and refused the
            // owner's next move. A command recorded before the stamp, or a
            // planned one, keeps whatever clock the replay already had.
            const turnStartedAt = planned ? undefined : recordedTurnStartedAt(command);
            if (turnStartedAt !== undefined) state.lastTurnTimestamp = turnStartedAt;
            // One snapshot per command *applied*, which is not the same as per
            // command fed in: a command can bring a follow-up with it, and that
            // gets its own step rather than being folded into the trigger's —
            // see ICommandOutcome.followUpCommand.
            const { outcome, gameOver } = await runCommand(state, gameType, command, {
                outOfTurn: onTurnOf !== undefined,
                onStep: (applied, appliedOutcome) => {
                    // Every command actually applied, the follow-ups among them:
                    // this is the plan handed back to the client to resend.
                    resolvedOut?.push(applied);
                    snapshot(applied, planned, appliedOutcome);
                    onStep?.({
                        prev: snapshots[snapshots.length - 2],
                        next: snapshots[snapshots.length - 1],
                        command: applied,
                        outcome: appliedOutcome,
                        planned,
                    }, state.specificGameState);
                },
                // A follow-up was recorded when it ran, marked with the id of the
                // command it answered, so it is already the next entry in this very
                // list and the loop will apply it in a moment — with the id and
                // timestamp its history line was stamped with. Running the
                // regenerated one as well would apply it twice, which (in a game
                // whose Special Build phase leaves a second end turn legal) quietly
                // ends somebody else's turn too.
                //
                // A turn played before its game recorded follow-ups carries no such
                // entry, so there the regenerated one is what keeps the replay
                // faithful to the turn as it happened.
                resolveFollowUp: (generated, trigger) =>
                    (isRecordedFollowUpOf(rawCommands[index + 1], trigger.id) ? null : generated),
            });
            if (!outcome.validMove) {
                continue;
            }
            if (gameOver) {
                return true;
            }
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
    const setupHistory = resolveHistory(persistedHistory.slice(state.gameState.history.length), historyNames);

    const resolvedPlannedCommands: unknown[] = [];
    if (!gameOver && plannedCommands.length) {
        await applyCommands(plannedCommands, true, resolvedPlannedCommands);
    }

    if (setupHistory.length) {
        snapshots.forEach((s) => s.history.push(...setupHistory));
    }

    return { currentIndex, snapshots, resolvedPlannedCommands };
}

// Every player's id standing in as their name, for a caller that needs a
// userIdNameMap but only ever looks players up by id. Usernames aren't resolved
// at game-end (recordGameResult only has userIds), matching the compute-by-userId
// / format-by-username split every other game's result stats already use, so an
// identity map is enough for any such caller: the result stats' replays, and the
// table's view a check is judged on (awardAchievements.ts tableView).
export function identityNameMap(userIdList: readonly string[]): { [userId: string]: string } {
    return Object.fromEntries(userIdList.map(userId => [userId, userId]));
}

// Replays a game via buildTimeline, calling `onStep` for every applied
// command together with the 0-based index of the turn it belongs to and
// whether it's the first step of that turn — the shared bookkeeping
// computePerTurnStat and computePerTurnEvents both need: a turn ends when
// whose turn it is changes (`playedOnTurnOf` — the sender, or for a command
// played out of turn the player whose turn it was, so an interrupt is part of
// the turn it landed in rather than a turn of its own), not whenever a
// command reports `turnOver` (a bonus like
// Dice Cities' roll-doubles-go-again keeps the same player acting across
// several `turnOver: true` commands, since their CheckEndTurn holds the seat
// instead of advancing it), the same maximal-run-of-one-sender boundary
// countTurns() (turnCount.ts) uses for the result page's "N turns" line, so
// every per-turn chart and that summary agree on how long the game ran.
// Usernames aren't resolved yet at game-end (recordGameResult only has
// userIds), so both callers give it the identityNameMap.
//
// Returns false (having already warned) if the replay itself throws, rather
// than letting the error propagate: a snapshot-replay game created before its
// snapshot existed can't be replayed at all (see
// docs/turn-recap-and-planning.md), and both callers run on the last move of
// a game, inside recordGameResult, so throwing here would cost a player their
// final turn to lose a chart nobody has seen yet. Downgrading instead is the
// same graceful no-op recap already makes for those games — but it's worth a
// warning, since the other way to land here is a genuinely broken adapter.
async function replayTurnByTurn(
    gameData: IGameData,
    onStep: (step: IReplayStep, turnIndex: number, isFirstStepOfTurn: boolean, specificGameState: unknown) => void,
    what: string,
): Promise<boolean> {
    const identityMap = identityNameMap(gameData.userIdList);
    let turnIndex = 0;
    let previousTurnOf: string | undefined;
    try {
        await buildTimeline(gameData, identityMap, [], (step, specificGameState) => {
            const turnOf = playedOnTurnOf(step.command);
            const isFirstStepOfTurn = previousTurnOf !== undefined && turnOf !== previousTurnOf;
            if (isFirstStepOfTurn) {
                turnIndex++;
            }
            onStep(step, turnIndex, isFirstStepOfTurn, specificGameState);
            previousTurnOf = turnOf;
        });
        return true;
    } catch (error) {
        console.warn(`No ${what} for game ${gameData.gameId}: ${error}`);
        return false;
    }
}

// Records a cumulative per-player stat at the end of each turn - the series a
// per-turn line chart plots (e.g. Dice Cities' coins/turn, Settlements &
// Cities' resources/turn - see each game's GAME_RESULT_STATS entry in
// GameResultData.ts for the actual field being tracked). extractValue is
// expected to look players up by their `.userId` field regardless of how the
// map keyed them.
// `keys` are the roster unless a game says otherwise — pass its own keys
// (Outbreak's four disease colours) for a series whose lines aren't players,
// and each turn's Map comes back keyed by those instead, ready for
// formatPerTurnChart's `series`.
export async function computePerTurnStat<TState>(
    gameData: IGameData,
    extractValue: (state: TState, key: string) => number | undefined,
    keys: string[] = gameData.userIdList,
): Promise<Map<string, number>[]> {
    // A snapshot's response state is a fresh object per step, so it can be
    // held until its turn ends and read then.
    const perTurn = await lastOfEachTurn(gameData, (step) => step.next.specificGameState as TState, "per-turn stat");
    return perTurn?.map(state => new Map(keys.map(key => [key, extractValue(state, key) ?? 0]))) ?? [];
}

// What `read` made of the last step of every turn, oldest first — the turn
// boundary every per-turn stat shares — or undefined, having warned, when the
// replay fails.
async function lastOfEachTurn<T>(
    gameData: IGameData,
    read: (step: IReplayStep, specificGameState: unknown) => T,
    what: string,
): Promise<T[] | undefined> {
    const perTurn: T[] = [];
    let latest: { value: T } | undefined;
    const ok = await replayTurnByTurn(gameData, (step, _turnIndex, isFirstStepOfTurn, specificGameState) => {
        if (isFirstStepOfTurn && latest) perTurn.push(latest.value);
        latest = { value: read(step, specificGameState) };
    }, what);
    if (!ok) return undefined;
    if (latest) perTurn.push(latest.value);
    return perTurn;
}

// computePerTurnStat for a game whose stats have to read what the response
// hides, several stats from the one replay: each extractor is handed the
// internal specificGameState — every player's hand — after every turn, which
// is how Settlements & Cities' victory-points chart counts the VP cards
// nobody else could see until the game ended, and how its resources table
// counts what each player gathered from the first move, in a game the live
// document only began counting by resource part-way through. One pass keeps
// the last move — which the turn-timer cron awaits inline — to one replay.
//
// An extractor returns undefined for a key that has left the state — a
// player the game dropped (utils/games/playerDropout.ts), whose seat is
// deleted with them — and that key holds the value it last had (nought
// before it ever had one), so a line stops where its player left rather than
// falling to nothing. The last turn's reading is then what every seat ended
// the game on, a dropped player's as they left.
//
// Server-only: nothing here may reach a response, so only a finished game's
// own totals should ever be extracted. Undefined when the replay fails.
export async function computePerTurnInternalStats<TState, K extends string>(
    gameData: IGameData,
    extractors: Record<K, (state: TState, key: string) => number | undefined>,
    keys: string[] = gameData.userIdList,
): Promise<Record<K, Map<string, number>[]> | undefined> {
    const names = Object.keys(extractors) as K[];
    // Read eagerly, at every step: the internal state is one object the next
    // step mutates in place, so holding it until the turn ends would read the
    // wrong turn.
    const entries = await lastOfEachTurn(gameData, (_step, specificGameState) => {
        const state = specificGameState as TState;
        return names.map(name => new Map(keys.map(key => [key, extractors[name](state, key)])));
    }, "per-turn stats");
    if (!entries) return undefined;
    return Object.fromEntries(names.map((name, i) => [name, holdingLastValues(entries.map(entry => entry[i]))])) as Record<K, Map<string, number>[]>;
}

// Each turn's reading with its gaps filled from the turn before — nought
// before a key ever had a value.
function holdingLastValues(perTurn: Map<string, number | undefined>[]): Map<string, number>[] {
    const filled: Map<string, number>[] = [];
    for (const turn of perTurn) {
        const previous = filled.at(-1);
        filled.push(new Map([...turn].map(([key, value]) => [key, value ?? previous?.get(key) ?? 0])));
    }
    return filled;
}

// Replays a game via buildTimeline, calling `detect` once per applied command
// and recording any events it returns against the turn they happened in — the
// same whose-turn-changes boundary computePerTurnStat groups by, so an event
// computed from the same replay lands on the same round as a per-turn stat
// next to it (see GameResultEvent, GameDataApi.ts). A single turn can produce
// more than one event (Outbreak's double epidemic).
export async function computePerTurnEvents(
    gameData: IGameData,
    // `events` is every marker recorded so far, oldest first. A detector only
    // ever reads it — or takes its own last marker back off it, for a step
    // that undoes the move the marker was for (docs/undo.md).
    detect: (step: IReplayStep, events: GameResultEvent[]) => Omit<GameResultEvent, 'turnIndex'>[] | undefined,
): Promise<GameResultEvent[]> {
    const events: GameResultEvent[] = [];
    const ok = await replayTurnByTurn(gameData, (step, turnIndex) => {
        for (const event of detect(step, events) ?? []) {
            events.push({ ...event, turnIndex });
        }
    }, "per-turn events");
    return ok ? events : [];
}
