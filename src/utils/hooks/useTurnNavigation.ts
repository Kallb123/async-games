import { useCallback, useEffect, useRef, useState } from "react";
import { IGameCommand } from "@/utils/apiModels/GameLogic";
import { IHistoryEntryResponse } from "@/utils/apiModels/GameDataApi";
import { withFullHistories, WithHistoryDelta } from "@/utils/games/historyDelta";
import { REQUEST_TIMEOUT_MS } from "./fetchWithSessionRetry";

// One reconstructed point on the game timeline (mirrors the server ITurnSnapshot).
export interface ITurnSnapshot<TState = unknown, TOutcome = unknown> {
    index: number;
    specificGameState: TState;
    currentTurn: string;
    complete: boolean;
    winner: string;
    history: IHistoryEntryResponse[];
    command: {
        senderId: string;
        senderUsername: string;
        timestamp: string;
        summary: string;
    } | null;
    planned: boolean;
    // What the command behind it did, for a game whose replay adapter opts in
    // (IReplayAdapter.snapshotOutcome).
    outcome?: TOutcome;
}

interface ITimelineResponse<TState, TOutcome> {
    success: boolean;
    currentIndex: number;
    snapshots: ITurnSnapshot<TState, TOutcome>[];
    resolvedPlannedCommands: unknown[];
}

// What the route actually sends: each snapshot's history as the change from the
// one before it (see utils/games/historyDelta.ts), stitched back into full logs
// on arrival — or, from a deployment that predates deltas, already in full.
interface ITimelineWireResponse<TState, TOutcome> extends Omit<ITimelineResponse<TState, TOutcome>, "snapshots"> {
    snapshots: (WithHistoryDelta<ITurnSnapshot<TState, TOutcome>> | ITurnSnapshot<TState, TOutcome>)[];
}

export type NavMode = "live" | "recap" | "planning";

// How long auto-play rests on a step before moving to the next, for a game that
// doesn't say. Long enough to read a one-line action, short enough that a
// match's worth doesn't drag.
export const DEFAULT_STEP_DURATION_MS = 1500;

// What the hook accepts beyond the game id and the live view. Everything here
// is opt-in: a game that passes nothing gets the plain stepper it always had.
export interface TurnNavigationOptions<TState, TOutcome> {
    // How long auto-play stays on `snapshot` before advancing — the time the
    // game's own animation of that step needs. `previous` is the position the
    // step was played from (undefined for the opening position). Realm Arena
    // returns longer for a step that plays out several hits.
    stepDurationMs?: (
        snapshot: ITurnSnapshot<TState, TOutcome>,
        previous: ITurnSnapshot<TState, TOutcome> | undefined
    ) => number;
}

// A duration a game hands back is trusted no further than it can be used: NaN
// or a negative would turn the timer into a busy loop, so it falls back.
export function playbackDelay(ms: number | undefined): number {
    return typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? ms : DEFAULT_STEP_DURATION_MS;
}

// Where "replay from your last turn" starts *from* — the position before the
// first step to be shown, so that step is the viewer's own last command (in a
// co-op game the enemy's turn rides inside that command, so it plays too).
// Only played steps count, never a planned one. A viewer who has made no
// command has no "last turn" to find, and starting at the top of a long game
// would be the wrong answer, so they get the one step before the present.
export function replayStartIndex(
    snapshots: readonly Pick<ITurnSnapshot, "command">[],
    currentIndex: number,
    viewerId: string
): number {
    for (let i = Math.min(currentIndex, snapshots.length - 1); i >= 1; i--) {
        if (snapshots[i].command?.senderId === viewerId) return i - 1;
    }
    return Math.max(0, currentIndex - 1);
}

// The live values the page already holds, used when mode === "live".
export interface LiveGameView<TState> {
    specificGameState: TState | undefined;
    currentTurn: string;
    complete: boolean;
    winner: string;
    history: IHistoryEntryResponse[];
}

// Shared navigation model behind both turn recap (stepping back through the
// game's played actions) and planning mode (stepping through hypothetical
// future actions). Both step one *command* at a time, not one turn: a turn
// that took several commands (roll, build, build, end) is several steps here.
// Both are driven by the same reconstructed timeline from /api/game/[id]/timeline.
//
// Auto-play is the same stepping on a timer: `play` walks forward to the live
// position and stops there, resting on each step for as long as the game says
// its animation takes (`options.stepDurationMs`). Anything the player does by
// hand stops it.
export function useTurnNavigation<TState, TOutcome = unknown>(
    gameId: string,
    live: LiveGameView<TState>,
    options?: TurnNavigationOptions<TState, TOutcome>
) {
    const [mode, setMode] = useState<NavMode>("live");
    const [snapshots, setSnapshots] = useState<ITurnSnapshot<TState, TOutcome>[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [viewIndex, setViewIndex] = useState(0);
    const [plannedCommands, setPlannedCommands] = useState<unknown[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [playing, setPlaying] = useState(false);

    // Callers pass `stepDurationMs` inline, so it is a new function every
    // render. Held in a ref the timer reads when it is armed, it cannot
    // re-arm (and so restart) the timer on every render.
    const stepDurationRef = useRef(options?.stepDurationMs);
    useEffect(() => {
        stepDurationRef.current = options?.stepDurationMs;
    });

    const fetchTimeline = useCallback(
        async (planned: unknown[]): Promise<ITimelineResponse<TState, TOutcome> | null> => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/game/${gameId}/timeline`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ plannedCommands: planned, historyDeltas: true }),
                    // Without a deadline a stalled connection never settles, so
                    // the `finally` below never runs and `loading` stays true —
                    // which now means the shell's loading bar pulses for the
                    // rest of the session. `useSubmitCommand` guards its own
                    // POST the same way. The `catch` below turns the abort into
                    // the ordinary error path.
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                });
                if (!res.ok) {
                    throw new Error("Unable to load timeline");
                }
                const wire: ITimelineWireResponse<TState, TOutcome> = await res.json();
                const data: ITimelineResponse<TState, TOutcome> = { ...wire, snapshots: withFullHistories(wire.snapshots) };
                setSnapshots(data.snapshots);
                setCurrentIndex(data.currentIndex);
                return data;
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to load timeline");
                return null;
            } finally {
                setLoading(false);
            }
        },
        [gameId]
    );

    const enterRecap = useCallback(async () => {
        setPlaying(false);
        const data = await fetchTimeline([]);
        if (!data) return;
        setPlannedCommands([]);
        setViewIndex(data.currentIndex);
        setMode("recap");
    }, [fetchTimeline]);

    const enterPlanning = useCallback(async () => {
        setPlaying(false);
        const data = await fetchTimeline([]);
        if (!data) return;
        setPlannedCommands([]);
        setViewIndex(data.currentIndex);
        setMode("planning");
    }, [fetchTimeline]);

    const returnToLive = useCallback(() => {
        setPlaying(false);
        setMode("live");
        setPlannedCommands([]);
    }, []);

    // Appends a hypothetical command and re-derives the timeline. Returns the
    // resulting planned snapshot and the resolved command (with its RNG outcome
    // recorded) so callers can drive UI such as a dice animation.
    const planMove = useCallback(
        async (
            command: IGameCommand
        ): Promise<{ snapshot: ITurnSnapshot<TState, TOutcome> | null; resolvedCommand: unknown } | null> => {
            setPlaying(false);
            const next = [...plannedCommands, command];
            const data = await fetchTimeline(next);
            if (!data) return null;
            setPlannedCommands(data.resolvedPlannedCommands);
            const lastIndex = data.snapshots.length - 1;
            setViewIndex(lastIndex);
            setMode("planning");
            return {
                snapshot: data.snapshots[lastIndex] ?? null,
                resolvedCommand: data.resolvedPlannedCommands[data.resolvedPlannedCommands.length - 1],
            };
        },
        [fetchTimeline, plannedCommands]
    );

    const clearPlan = useCallback(async () => {
        setPlaying(false);
        const data = await fetchTimeline([]);
        if (!data) return;
        setPlannedCommands([]);
        setViewIndex(data.currentIndex);
    }, [fetchTimeline]);

    const maxIndex = snapshots.length > 0 ? snapshots.length - 1 : 0;
    const clamp = useCallback((i: number) => Math.max(0, Math.min(maxIndex, i)), [maxIndex]);
    // Reaching for the transport by hand means the player has taken over, so
    // each of these ends auto-play rather than fighting it for the position.
    const stepBack = useCallback(() => {
        setPlaying(false);
        setViewIndex((i) => clamp(i - 1));
    }, [clamp]);
    const stepForward = useCallback(() => {
        setPlaying(false);
        setViewIndex((i) => clamp(i + 1));
    }, [clamp]);
    const jumpToStart = useCallback(() => {
        setPlaying(false);
        setViewIndex(0);
    }, []);
    const jumpToCurrent = useCallback(() => {
        setPlaying(false);
        setViewIndex(currentIndex);
    }, [currentIndex]);

    const stop = useCallback(() => setPlaying(false), []);

    // Auto-play never runs into the planned steps — it is for watching what
    // happened, and a plan is not that. So it only starts where there is a
    // played step ahead, and only in a review.
    const canPlay = mode !== "live" && viewIndex < currentIndex;
    const play = useCallback(() => {
        if (!canPlay) return;
        setPlaying(true);
        // The first step shows at once; the timer below then waits it out.
        setViewIndex(viewIndex + 1);
    }, [canPlay, viewIndex]);

    // "Replay from my last turn" on the recap screen: the same fetch as
    // `enterRecap`, then play from the step before the viewer's last command.
    const playFromLastTurnOf = useCallback(
        async (viewerId: string) => {
            setPlaying(false);
            const data = await fetchTimeline([]);
            if (!data) return;
            setPlannedCommands([]);
            const start = replayStartIndex(data.snapshots, data.currentIndex, viewerId);
            setMode("recap");
            // A one-position game has nothing to play: show it and stay put.
            if (start >= data.currentIndex) {
                setViewIndex(data.currentIndex);
                return;
            }
            setViewIndex(start + 1);
            setPlaying(true);
        },
        [fetchTimeline]
    );

    // The player: rest on the step shown for as long as it takes to animate,
    // then move on — or, at the live position, stop (the last step is waited
    // out too, so Stop stays up until its animation has finished). The state
    // is only set inside the timeout, and the cleanup clears it, so any change
    // to what is on screen (a manual step, a new timeline) re-arms it cleanly.
    useEffect(() => {
        if (!playing) return;
        const shown = snapshots[viewIndex];
        const ms = shown
            ? playbackDelay(stepDurationRef.current?.(shown, snapshots[viewIndex - 1]))
            : DEFAULT_STEP_DURATION_MS;
        const timer = setTimeout(() => {
            if (viewIndex >= currentIndex) setPlaying(false);
            else setViewIndex(viewIndex + 1);
        }, ms);
        return () => clearTimeout(timer);
    }, [playing, viewIndex, snapshots, currentIndex]);

    const isLive = mode === "live";
    const activeSnapshot: ITurnSnapshot<TState, TOutcome> | undefined = isLive ? undefined : snapshots[viewIndex];

    return {
        mode,
        isLive,
        loading,
        error,
        // Displayed values: live when in live mode, otherwise the viewed snapshot.
        displayedState: isLive ? live.specificGameState : activeSnapshot?.specificGameState,
        displayedCurrentTurn: isLive ? live.currentTurn : activeSnapshot?.currentTurn ?? "",
        displayedComplete: isLive ? live.complete : activeSnapshot?.complete ?? false,
        displayedWinner: isLive ? live.winner : activeSnapshot?.winner ?? "",
        displayedHistory: isLive ? live.history : activeSnapshot?.history ?? [],
        displayedCommand: activeSnapshot?.command ?? null,
        // What the viewed step did, where the game sends it — Realm Arena
        // plays it over the board. Undefined when live.
        displayedOutcome: activeSnapshot?.outcome,
        // The point the viewed step was played from, so a board can show what
        // that step changed — Realm Arena follows each action with its zoom.
        // Undefined when live, and at the start of the game.
        previousSnapshot: isLive ? undefined : snapshots[viewIndex - 1],
        // Position within the reconstructed timeline.
        viewIndex,
        currentIndex,
        // Count of steps in the reconstructed timeline — one per played (or
        // planned) *command*, not one per turn.
        totalActions: maxIndex,
        atCurrent: viewIndex === currentIndex,
        isPlannedView: activeSnapshot?.planned ?? false,
        plannedCount: plannedCommands.length,
        // How many entries at the front of displayedHistory are hypothetical
        // planned moves rather than real turns. Planned commands prepend their
        // entries on top of the real history, so it's the length difference
        // between the viewed snapshot and the live current snapshot.
        plannedHistoryCount: activeSnapshot?.planned
            ? Math.max(0, activeSnapshot.history.length - (snapshots[currentIndex]?.history.length ?? 0))
            : 0,
        canBack: !isLive && viewIndex > 0,
        canForward: !isLive && viewIndex < maxIndex,
        // Whether auto-play is stepping through the review on its own.
        playing,
        // Navigation
        stepBack,
        stepForward,
        jumpToStart,
        jumpToCurrent,
        // Auto-play (see above): `play` from the viewed step, `stop` to hold
        // where it is, `playFromLastTurnOf` for the recap screen's replay.
        play,
        stop,
        playFromLastTurnOf,
        // Modes
        enterRecap,
        enterPlanning,
        returnToLive,
        planMove,
        clearPlan,
    };
}
