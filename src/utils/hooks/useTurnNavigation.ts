import { useCallback, useState } from "react";
import { IGameCommand } from "@/utils/apiModels/GameLogic";

// One reconstructed point on the game timeline (mirrors the server ITurnSnapshot).
export interface ITurnSnapshot<TState = unknown> {
    index: number;
    specificGameState: TState;
    currentTurn: string;
    complete: boolean;
    winner: string;
    history: string[];
    command: {
        senderId: string;
        senderUsername: string;
        timestamp: string;
        summary: string;
    } | null;
    planned: boolean;
}

interface ITimelineResponse<TState> {
    success: boolean;
    currentIndex: number;
    snapshots: ITurnSnapshot<TState>[];
    resolvedPlannedCommands: unknown[];
}

export type NavMode = "live" | "recap" | "planning";

// The live values the page already holds, used when mode === "live".
export interface LiveGameView<TState> {
    specificGameState: TState | undefined;
    currentTurn: string;
    complete: boolean;
    winner: string;
    history: string[];
}

// Shared navigation model behind both turn recap (stepping back through actual
// turns) and planning mode (stepping through hypothetical future turns). Both
// are driven by the same reconstructed timeline from /api/game/[id]/timeline.
export function useTurnNavigation<TState>(gameId: string, live: LiveGameView<TState>) {
    const [mode, setMode] = useState<NavMode>("live");
    const [snapshots, setSnapshots] = useState<ITurnSnapshot<TState>[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [viewIndex, setViewIndex] = useState(0);
    const [plannedCommands, setPlannedCommands] = useState<unknown[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTimeline = useCallback(
        async (planned: unknown[]): Promise<ITimelineResponse<TState> | null> => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/game/${gameId}/timeline`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ plannedCommands: planned }),
                });
                if (!res.ok) {
                    throw new Error("Unable to load timeline");
                }
                const data: ITimelineResponse<TState> = await res.json();
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
        const data = await fetchTimeline([]);
        if (!data) return;
        setPlannedCommands([]);
        setViewIndex(data.currentIndex);
        setMode("recap");
    }, [fetchTimeline]);

    const enterPlanning = useCallback(async () => {
        const data = await fetchTimeline([]);
        if (!data) return;
        setPlannedCommands([]);
        setViewIndex(data.currentIndex);
        setMode("planning");
    }, [fetchTimeline]);

    const returnToLive = useCallback(() => {
        setMode("live");
        setPlannedCommands([]);
    }, []);

    // Appends a hypothetical command and re-derives the timeline. Returns the
    // resulting planned snapshot and the resolved command (with its RNG outcome
    // recorded) so callers can drive UI such as a dice animation.
    const planMove = useCallback(
        async (
            command: IGameCommand
        ): Promise<{ snapshot: ITurnSnapshot<TState> | null; resolvedCommand: unknown } | null> => {
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
        const data = await fetchTimeline([]);
        if (!data) return;
        setPlannedCommands([]);
        setViewIndex(data.currentIndex);
    }, [fetchTimeline]);

    const maxIndex = snapshots.length > 0 ? snapshots.length - 1 : 0;
    const clamp = useCallback((i: number) => Math.max(0, Math.min(maxIndex, i)), [maxIndex]);
    const stepBack = useCallback(() => setViewIndex((i) => clamp(i - 1)), [clamp]);
    const stepForward = useCallback(() => setViewIndex((i) => clamp(i + 1)), [clamp]);
    const jumpToStart = useCallback(() => setViewIndex(0), []);
    const jumpToCurrent = useCallback(() => setViewIndex(currentIndex), [currentIndex]);

    const isLive = mode === "live";
    const activeSnapshot: ITurnSnapshot<TState> | undefined = isLive ? undefined : snapshots[viewIndex];

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
        // Position within the reconstructed timeline.
        viewIndex,
        currentIndex,
        totalTurns: maxIndex,
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
        // Navigation
        stepBack,
        stepForward,
        jumpToStart,
        jumpToCurrent,
        // Modes
        enterRecap,
        enterPlanning,
        returnToLive,
        planMove,
        clearPlan,
    };
}
