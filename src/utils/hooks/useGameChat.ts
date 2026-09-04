'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRefreshableData } from "./useRefreshableData";
import { fetchWithSessionRetry, REQUEST_TIMEOUT_MS } from "./fetchWithSessionRetry";
import { CHAT_EVENTS } from "./usePushEvents";
import { normaliseMessage } from "@/utils/chat";
import type { IChatResponse, IChatMessageResponse } from "@/app/api/game/[gameid]/chat/route";

/** A thread message plus whether it's new since this viewing of the panel — see
 *  `unreadCutoffId` below. */
export interface GameChatMessage extends IChatMessageResponse {
    unread: boolean;
}

export interface GameChat {
    messages: GameChatMessage[];
    isLoading: boolean;
    isRefreshing: boolean;
    /** True while a POST is in flight — the composer disables Send. */
    sending: boolean;
    /** A message from someone else has landed since this browser last opened the
     *  thread. Drives the 💬 button's dot. */
    hasUnread: boolean;
    /** POSTs `text`, then refetches. Returns false on a rejected or failed send
     *  so the composer can keep what the player typed. */
    send: (text: string) => Promise<boolean>;
    /** True when there are messages older than the oldest one in `messages` —
     *  drives the panel's "Load earlier" control. */
    hasMoreEarlier: boolean;
    /** True while a `loadEarlier` fetch is in flight. */
    loadingEarlier: boolean;
    /** Fetches the CHAT_PAGE_SIZE messages before the oldest one currently
     *  loaded, and prepends them. A no-op while one is already in flight or
     *  there is nothing earlier to load. */
    loadEarlier: () => Promise<void>;
}

/**
 * A game's chat thread, and everything the shell needs to show it: the messages,
 * the two loading flags, a `send`, and the unread dot.
 *
 * It lives in `GameShell` and not in the panel because the dot has to know about
 * messages while the panel is *shut* — so the one fetch feeds both, and
 * `CHAT_EVENTS` keeps a closed thread current as long as the shell is mounted.
 * `pollWhileWatching` is gated on `open`: a closed thread has nothing to wait
 * for, and every tick is a request per watching player. `enabled` is false for a
 * single-seat game, whose shell mounts this hook but has no thread to read.
 *
 * There is no optimistic append. `useRefreshableData` owns `data` and hands out
 * no setter, so an optimistic list would be a second copy of the messages
 * rendering each sent line twice until the refetch reconciled it; a refetch
 * after a POST the player just waited on is imperceptible and has one source of
 * truth. See docs/in-game-chat.md §6.
 *
 * The read marker lives on the server (`data.readAt`), not in `localStorage`:
 * reading the thread on one device clears the dot on every other one. See
 * docs/in-game-chat.md §13.6.
 *
 * Older pages (`loadEarlier`) are the one piece of state this hook owns for
 * itself rather than taking from `useRefreshableData` — deliberately, and only
 * here. `useRefreshableData` owns `data` and hands out no setter, which is
 * exactly why there is no optimistic append above: a second copy of the *live*
 * window would drift from the poll's own copy the moment the two disagreed.
 * An older page cannot drift, because it never changes once fetched — nothing
 * edits or deletes a chat message, so a page of history fetched with `before`
 * is immutable, and it is disjoint from the polled window by construction (its
 * newest message is strictly older than the polled window's oldest). There is
 * therefore no reconciliation to get wrong: the live fetch stays the single
 * source of truth for the tail, and `olderMessages` is only ever appended to at
 * the front, then reset when `gameId` changes. See docs/in-game-chat.md §13.7
 * commit 5.
 */
export function useGameChat(gameId: string, open: boolean, enabled: boolean): GameChat {
    const { user } = useUser();
    const myId = user?.id;
    const { data, isLoading, isRefreshing, refresh } =
        useRefreshableData<IChatResponse>(`/api/game/${gameId}/chat`, CHAT_EVENTS, { pollWhileWatching: open, enabled });
    const [sending, setSending] = useState(false);
    const readAt = data?.readAt ?? null;

    // Memoized so its identity is stable across renders where `data` itself
    // hasn't changed — otherwise the `?? []` fallback would make it a new array
    // every render and defeat the `messages` useMemo below.
    const rawMessages = useMemo(() => data?.messages ?? [], [data]);
    const latest = rawMessages.length ? rawMessages[rawMessages.length - 1] : null;
    // `trackedLatestId` holds `null` when there is nothing to track, so the
    // newest id has to be normalised the same way before the two are compared —
    // otherwise an empty thread reports a change every render, and the
    // render-phase setState below never settles.
    const latestId = latest?.messageId ?? null;

    // Earlier pages, oldest-first, prepended to the polled window — see the
    // "why no reconciliation" note above. Reset on a `gameId` change the same
    // render-time-comparison way `wasOpen` resets `unreadCutoffId` below,
    // rather than in an effect (react-hooks/set-state-in-effect).
    const [olderMessages, setOlderMessages] = useState<IChatMessageResponse[]>([]);
    const [olderHasMore, setOlderHasMore] = useState(false);
    const [loadingEarlier, setLoadingEarlier] = useState(false);
    const [olderGameId, setOlderGameId] = useState(gameId);
    if (gameId !== olderGameId) {
        setOlderGameId(gameId);
        setOlderMessages([]);
        setOlderHasMore(false);
    }
    // Before any earlier page has been fetched, "is there more?" is exactly
    // what the live GET already answered; once at least one has, it's what
    // that page itself answered — the two never both apply.
    const hasMoreEarlier = olderMessages.length > 0 ? olderHasMore : (data?.hasMore ?? false);

    // The in-flight guard `loadEarlier` checks is a ref, not the `loadingEarlier`
    // state above — a double-tap can fire before React commits the state update
    // (and before the button's own `disabled` follows it), and two concurrent
    // requests for the same page would both resolve and both prepend, duplicating
    // messages (and their React keys). `useSubmitCommand` guards its own in-flight
    // POST the same way, for the same reason. `loadingEarlier` state still exists
    // for the UI to render from.
    const loadingEarlierRef = useRef(false);
    // The `gameId` this render is for, read back once a `loadEarlier` fetch
    // resolves: `GameShell` mounts `useGameChat` once per matched route, so
    // switching games client-side doesn't remount this hook (the render-time
    // reset above is the proof it's already anticipated). A fetch started for
    // one game landing after the player has switched to another must not
    // prepend that game's history onto this one's.
    const currentGameIdRef = useRef(gameId);
    useEffect(() => { currentGameIdRef.current = gameId; }, [gameId]);

    const loadEarlier = useCallback(async () => {
        const oldest = olderMessages.length > 0 ? olderMessages[0] : rawMessages[0];
        if (loadingEarlierRef.current || !oldest) {
            return;
        }
        loadingEarlierRef.current = true;
        setLoadingEarlier(true);
        const requestedGameId = gameId;
        try {
            const params = new URLSearchParams({ before: oldest.timestamp, beforeMessageId: oldest.messageId });
            const response = await fetchWithSessionRetry(
                `/api/game/${gameId}/chat?${params.toString()}`,
                () => currentGameIdRef.current !== requestedGameId,
            );
            if (currentGameIdRef.current !== requestedGameId) {
                // The player switched games while this was in flight — the
                // response, if any, belongs to a thread nobody is looking at
                // any more.
                return;
            }
            if (!response || !response.ok) {
                console.error(`Failed to load earlier chat messages: ${response?.status ?? 'network error'}`);
                return;
            }
            const body = await response.json() as IChatResponse;
            setOlderMessages((prev) => [...body.messages, ...prev]);
            setOlderHasMore(body.hasMore);
        } catch (error) {
            console.error('Failed to load earlier chat messages', error);
        } finally {
            loadingEarlierRef.current = false;
            setLoadingEarlier(false);
        }
    }, [gameId, olderMessages, rawMessages]);

    // The boundary this *viewing* of the panel treats as "already read" — every
    // message *after* the one `unreadCutoffId` names, by position in
    // `rawMessages`, is "new". It starts frozen at whatever the marker was when
    // the panel opened (the effect below starts advancing the real marker,
    // `readAt`, the moment the panel opens, so if the unread styling followed
    // `readAt` live it would clear within one poll of opening), then *rolls
    // forward* every time a poll brings in a message newer than
    // `trackedLatestId` — the newest message as of the previous snapshot: the
    // batch that just arrived becomes the newly-marked one, and the batch that
    // was marked before it (now superseded) stops being marked. A player
    // watching the thread live sees each message arrive as new, but doesn't
    // have the last one singled out once another has taken its place.
    // `undefined` means "not captured for this viewing yet".
    //
    // Tracked by messageId and read back as an array *position*, not by
    // comparing timestamp strings: two messages from different senders can
    // legitimately share the same millisecond (the GET route ties `messageId`
    // in as a tiebreaker for exactly this reason), so rolling the cutoff
    // forward to a bare timestamp could silently swallow a same-millisecond
    // message that arrived alongside the one that superseded it — a real
    // message with nothing on screen ever having marked it new.
    //
    // Adjusted directly during render (not in an effect, which would setState
    // synchronously and trigger a cascading render — react-hooks/set-state-in-
    // effect) — the same `loadedFor`-style comparison `useTurnRecap` uses.
    const [unreadCutoffId, setUnreadCutoffId] = useState<string | null | undefined>(undefined);
    const [trackedLatestId, setTrackedLatestId] = useState<string | null>(null);
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (!open) {
            setUnreadCutoffId(undefined);
        }
    }
    // Gated on `data !== null`, not just `!isLoading`: a failed fetch also
    // leaves `isLoading` false (useRefreshableData flips it in its `finally`
    // whether or not the request succeeded) but `data` stays null, and `readAt`
    // would read as `null` — indistinguishable from "never opened this thread".
    // Capturing that as the cutoff would mark the whole history unread for
    // this viewing; waiting for real data means a retry or the next poll
    // captures the correct cutoff instead.
    if (open && !isLoading && data !== null) {
        if (unreadCutoffId === undefined) {
            // readAt is the server's own boundary, so it's compared against
            // timestamps here same as it always was (matching `hasUnread`
            // below) — this one-time conversion into a messageId only has to
            // find *a* message at or before it, not out-tiebreak a same-poll
            // arrival the way the rolling step below does.
            const cutoffMessage = readAt === null ? undefined
                : [...rawMessages].reverse().find((message) => message.timestamp <= readAt);
            setUnreadCutoffId(cutoffMessage?.messageId ?? null);
            setTrackedLatestId(latestId);
        } else if (latestId !== trackedLatestId) {
            setUnreadCutoffId(trackedLatestId);
            setTrackedLatestId(latestId);
        }
    }

    const messages: GameChatMessage[] = useMemo(() => {
        // Older pages predate the polled window entirely, so nothing in them
        // can be "new since this viewing" — they're always unread: false.
        const older: GameChatMessage[] = olderMessages.map((message) => ({ ...message, unread: false }));

        // Not captured yet (still loading, or the panel is shut) — nothing in
        // the live window is markable as new either.
        if (unreadCutoffId === undefined) {
            return [...older, ...rawMessages.map((message) => ({ ...message, unread: false }))];
        }
        // `null` means "no boundary" (never read before): everything counts as
        // after it. A real id that's rolled off the loaded page (paged out by
        // CHAT_PAGE_SIZE) behaves the same way — findIndex returns -1 — which
        // is the same generous "mark what's currently loaded" fallback the
        // timestamp version had at that edge.
        const cutoffIndex = unreadCutoffId === null ? -1
            : rawMessages.findIndex((message) => message.messageId === unreadCutoffId);
        return [...older, ...rawMessages.map((message, index) => ({
            ...message,
            // `myId` is momentarily undefined before Clerk resolves; treating
            // that as "not mine" would flag the viewer's own already-read
            // messages as unread for a render.
            unread: myId !== undefined && message.senderId !== myId && index > cutoffIndex,
        }))];
    }, [rawMessages, olderMessages, myId, unreadCutoffId]);

    // While the panel is open, advance the marker to the newest message — and
    // keep advancing it as the poll brings more in — so the dot never lights for
    // a line the player is looking at. A failed POST is logged and dropped: the
    // dot staying lit for another minute is the correct failure, and there is
    // nothing to retry that the next open won't do anyway.
    const latestTimestamp = latest?.timestamp ?? null;
    useEffect(() => {
        if (!open || latestTimestamp === null || latestTimestamp === readAt) {
            return;
        }
        fetch(`/api/game/${gameId}/chat/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ readAt: latestTimestamp }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }).then((response) => {
            if (!response.ok) {
                console.error(`Failed to mark chat read: ${response.status}`);
            }
        }).catch((error) => {
            console.error('Failed to mark chat read', error);
        });
    }, [open, latestTimestamp, readAt, gameId]);

    // Unread: a message that landed after the marker and came from someone else.
    // A browser that has never opened the thread (readAt null) treats every other
    // player's message as unread, which is the right first-time signal. This one
    // follows the live marker, not the rolling `unreadCutoffId` above — the
    // topbar dot should clear the moment the marker does, unlike the panel's
    // own unread styling.
    const hasUnread = rawMessages.some(
        (message) => message.senderId !== myId && (readAt === null || message.timestamp > readAt),
    );

    const send = useCallback(async (text: string): Promise<boolean> => {
        // The same gate the route applies, so the composer can't send something
        // the server will 400 — one validation module, no drift (utils/chat.ts).
        const message = normaliseMessage(text);
        if (message === null) {
            return false;
        }
        setSending(true);
        try {
            const response = await fetch(`/api/game/${gameId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: message }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (!response.ok) {
                console.error(`Failed to send chat message: ${response.status}`);
                return false;
            }
            await refresh();
            return true;
        } catch (error) {
            console.error('Failed to send chat message', error);
            return false;
        } finally {
            setSending(false);
        }
    }, [gameId, refresh]);

    return { messages, isLoading, isRefreshing, sending, hasUnread, send, hasMoreEarlier, loadingEarlier, loadEarlier };
}
