'use client'
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastContext";
import { useIsAuthorised } from "./useAuthGuard";
import { TURN_ADVANCED_EVENTS } from "./usePushEvents";
import { useRefreshableData } from "./useRefreshableData";
import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";

/** What `/api/game/[gameid]` answers with. Nothing reads its `success` flag. */
interface IGameDataBody<T> {
    gameData: T;
}

/**
 * Fetches a game's current state from `/api/game/[gameid]`, shared by every
 * game screen. It is `useRefreshableData` pointed at one game: the loading
 * flags, the drop-overlapping-fetches bookkeeping, the keep-the-last-good-body
 * failure handling and the backoff retries are all that hook's, and what is
 * left here is the three things that are actually about a game — which body
 * field the board wants, when an opponent could be moving, and where a viewer
 * goes when the game isn't theirs to look at.
 *
 * `loading` is true whenever a fetch is in flight — the first one and every
 * later refresh — which is what the shell's top-bar loading bar renders from.
 * It is the `isLoading`/`isRefreshing` pair collapsed back into one flag: a
 * board never swaps itself out for a skeleton, so the only thing either would
 * drive here is that one bar.
 *
 * **A failed fetch never moves a player off a board they can see.** It used to:
 * any failure that wasn't a 404 pushed them home, so a single background poll
 * losing its connection — a phone changing network, a session cookie
 * mid-refresh — ejected somebody from a board they were in the middle of, onto
 * a dashboard whose own fetch was failing for exactly the same reason and so
 * came up empty. Now a failure keeps the board it has, and the retries
 * underneath bring it back. Three answers move a viewer, and none of them is a
 * board they were playing:
 *
 * - **404** — no such live game. It may still have a finished `GameResult`, so
 *   the viewer goes to that game's result page, which enforces its own view
 *   permission.
 * - **403** — a real game they aren't a player in. Home.
 * - **Nothing ever loaded**, and `useRefreshableData` has stopped retrying: a
 *   revoked session Clerk hasn't caught up with, a game whose record reliably
 *   500s, a network that never came back. There is nothing to eject them
 *   *from* — the board has never had anything on it — and a shell reading
 *   "Loading…" for the rest of the afternoon, quietly asking again every ten
 *   seconds, tells them nothing. Home, with a toast that says why.
 */
export function useGameData<T extends IGameDataResponse>(gameId: string) {
    const { isAuthorised, user } = useIsAuthorised();
    const router = useRouter();
    const { showToast } = useToast();

    // Poll only while there is something that could change under us: the game is
    // live and the turn belongs to somebody else. On the viewer's own turn
    // nothing can move until they act, so polling then would be pure noise — and
    // `YourTurn` already pushes the moment the turn comes back to them.
    // `currentTurn` is empty until the first fetch lands, and on a finished game.
    const waitingOnOpponent = (body: IGameDataBody<T> | null) => {
        const game = body?.gameData;
        return !!game?.currentTurn && !game.complete && game.currentTurn !== user?.id;
    };

    const { data, setData, isLoading, isRefreshing, status, refresh } = useRefreshableData<IGameDataBody<T>>(
        `/api/game/${gameId}`,
        TURN_ADVANCED_EVENTS,
        { pollWhileWatching: waitingOnOpponent },
    );

    // Null until the first response lands, rather than `{} as T`. The cast was
    // a lie the compiler then enforced everywhere downstream: every screen
    // reads `gameData.specificGameState.…` on its very first render, when the
    // object is empty, and the type said that was safe. Every board already
    // optional-chains its way around it — this makes the type agree with the
    // code, so a new screen that forgets is a compile error rather than a
    // blank board and a thrown render.
    const gameData = data?.gameData ?? null;

    // The same `Dispatch` the screens have always been handed — the updater
    // form included, which is how a reaction gets patched into the history in
    // place — mapped onto the one field of the body it lives in.
    const setGameData = useCallback<Dispatch<SetStateAction<T | null>>>((update) => {
        setData((previous) => {
            const current = previous?.gameData ?? null;
            const next = typeof update === 'function'
                ? (update as (previous: T | null) => T | null)(current)
                : update;
            // An updater that had nothing to patch hands back exactly what it
            // was given; keeping the same body object then keeps the render it
            // would otherwise cost.
            if (next === current) {
                return previous;
            }
            return next === null ? null : { gameData: next };
        });
    }, [setData]);

    // Fired at most once: `showToast` is a new function on every render of the
    // provider, so without this the same navigation would stack up a toast per
    // render while it was still happening.
    const strandedRef = useRef(false);

    useEffect(() => {
        if (status === 404) {
            // `replace`, not `push`: Back from the result page should go
            // wherever they came from, not to the board that just sent them
            // here and would only send them straight back.
            router.replace(`/games/result/${gameId}`);
            return;
        }
        if (status === 403) {
            router.replace('/');
            return;
        }
        // `isLoading` only clears once `useRefreshableData` has an answer it is
        // going to act on, so no game to show plus a status to report is a board
        // that failed to load and has run out of retries — the third case in the
        // note above. `status` is null until an attempt completes for *this*
        // game, so switching between two boards can't land here on the last
        // one's answer.
        if (gameData === null && !isLoading && status !== null && !strandedRef.current) {
            strandedRef.current = true;
            showToast("Couldn't load that game. Check your connection and try again.", 'danger');
            router.replace('/');
        }
    }, [status, isLoading, gameData, gameId, router, showToast]);

    return {
        gameData,
        setGameData,
        getGameData: refresh,
        // Gated on `isAuthorised` — the condition on the only thing that ever
        // clears the flag. Clerk's script not loading at all (a blocker, an
        // outage, an offline first paint) leaves `isAuthorised` false forever,
        // and `useAuthGuard` deliberately doesn't redirect for it; without this
        // the bar would pulse for the life of the tab with nothing in flight.
        loading: (isLoading || isRefreshing) && isAuthorised,
    };
}
