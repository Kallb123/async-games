'use client'
import { useMemo, type FocusEventHandler, type PointerEventHandler } from "react";
import { prefetchGameData } from "./prefetchGameData";
import { useIsAuthorised, useSessionRefresh } from "./useAuthGuard";

/** The three events that mean "this game is next", ready to spread onto its link. */
export interface GamePrefetchHandlers {
    onPointerDown: PointerEventHandler;
    onPointerEnter: PointerEventHandler;
    onFocus: FocusEventHandler;
}

/**
 * Starts fetching a game's board (`prefetchGameData`) when the player shows
 * they are about to open it: a finger or a click going down on the row, the
 * mouse arriving over it, or keyboard focus landing on it. Hover counts for a
 * mouse only — a touch screen's "enter" is the same press as the pointer-down,
 * and a stylus passing over a list is not a choice.
 *
 * Use through `GameLink`, which every row that links to a board is, rather
 * than wiring the events by hand.
 */
export function useGamePrefetch(gameId: string): GamePrefetchHandlers {
    const { user, isAuthorised } = useIsAuthorised();
    const refreshSession = useSessionRefresh();
    const userId = isAuthorised ? user?.id : null;
    return useMemo(() => {
        const start = () => prefetchGameData(userId, gameId, refreshSession);
        return {
            onPointerDown: start,
            onPointerEnter: (event) => { if (event.pointerType === 'mouse') start(); },
            onFocus: start,
        };
    }, [userId, gameId, refreshSession]);
}
