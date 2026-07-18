import { IGameData } from "../mongodb/GameData";
import { IGameCommand, IGameType } from "../apiModels/GameLogic";
import { deserializeJSON } from "../apiModels/Serialisable";
import { buildInitialSnakesAndLaddersState, gameStateToModel } from "@/games/SnakesAndLadders/SnakesAndLaddersModels";

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

// A per-game adapter tells the generic engine how to (a) build the deterministic
// initial state and (b) convert mongo-shaped state to the response shape the UI
// renders. All game rules themselves are reused via each command's Execute().
export interface IReplayAdapter {
    className: string; // gameType.className
    buildInitialSpecificGameState(userIdList: string[]): unknown;
    toResponseState(specificGameState: unknown, userIdNameMap: { [key: string]: string }): unknown;
}

const adapters: Record<string, IReplayAdapter> = {};
export function registerReplayAdapter(adapter: IReplayAdapter) {
    adapters[adapter.className] = adapter;
}
export function getReplayAdapter(className: string): IReplayAdapter | undefined {
    return adapters[className];
}

registerReplayAdapter({
    className: "SnakesAndLaddersGameType",
    buildInitialSpecificGameState: (userIdList) => buildInitialSnakesAndLaddersState(userIdList),
    toResponseState: (specificGameState, userIdNameMap) =>
        gameStateToModel(specificGameState as never, userIdNameMap),
});

// Reconstructs a game's full timeline by replaying its recorded commandHistory
// from a fresh initial state, then optionally applying hypothetical planned
// commands on top. Mirrors the command route's per-command pipeline
// (Execute -> CheckGameOver -> CheckEndTurn) but never persists or notifies.
export async function buildTimeline(
    gameData: IGameData,
    userIdNameMap: { [key: string]: string },
    plannedCommands: IGameCommand[] = []
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
        gameState: {
            turnOrder: [...gameData.gameState.turnOrder],
            history: [],
            commandHistory: [],
        },
        complete: false,
        winner: "",
        specificGameState: adapter.buildInitialSpecificGameState(gameData.userIdList),
    };

    const snapshots: ITurnSnapshot[] = [];
    let index = 0;
    const snapshot = (command: IGameCommand | null, planned: boolean) => {
        snapshots.push({
            index: index++,
            specificGameState: adapter.toResponseState(state.specificGameState, userIdNameMap),
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
                return true;
            }
            gameType.CheckEndTurn(state, outcome);
            snapshot(command, planned);
        }
        return false;
    };

    const gameOver = await applyCommands(gameData.gameState.commandHistory ?? [], false, null);
    const currentIndex = snapshots.length - 1;

    const resolvedPlannedCommands: unknown[] = [];
    if (!gameOver && plannedCommands.length) {
        await applyCommands(plannedCommands, true, resolvedPlannedCommands);
    }

    return { currentIndex, snapshots, resolvedPlannedCommands };
}
