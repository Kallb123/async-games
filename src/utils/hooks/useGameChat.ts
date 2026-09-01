'use client'
import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRefreshableData } from "./useRefreshableData";
import { REQUEST_TIMEOUT_MS } from "./fetchWithSessionRetry";
import { CHAT_EVENTS } from "./usePushEvents";
import { normaliseMessage } from "@/utils/chat";
import type { IChatResponse, IChatMessageResponse } from "@/app/api/game/[gameid]/chat/route";

/** A thread message plus whether it's new since this viewing of the panel — see
 *  `readBoundary` below. */
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
    const latest = rawMessages.length ? rawMessages[rawMessages.length - 1].timestamp : null;

    // The boundary this *viewing* of the panel treats as "already read", frozen
    // at whatever the marker was when the panel opened. The effect below starts
    // advancing the real marker (`readAt`) the moment the panel opens, so if the
    // unread styling followed `readAt` live it would clear within one poll of
    // opening — using the frozen boundary instead means a message that arrived
    // since last time stays marked as new for as long as this viewing stays
    // open. `undefined` means "not captured for this viewing yet".
    //
    // `boundaryLatest` is the newest message that existed at the same moment —
    // once a poll brings in something newer than that, the whole divider clears
    // rather than sitting there stale: a player watching the thread live and
    // seeing a message arrive doesn't need "new since last time" pointed out to
    // them, they just watched it happen.
    //
    // Adjusted directly during render (not in an effect, which would setState
    // synchronously and trigger a cascading render — react-hooks/set-state-in-
    // effect) — the same `loadedFor`-style comparison `useTurnRecap` uses.
    const [readBoundary, setReadBoundary] = useState<string | null | undefined>(undefined);
    const [boundaryLatest, setBoundaryLatest] = useState<string | null>(null);
    const [wasOpen, setWasOpen] = useState(open);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (!open) {
            setReadBoundary(undefined);
        }
    }
    // Gated on `data !== null`, not just `!isLoading`: a failed fetch also
    // leaves `isLoading` false (useRefreshableData flips it in its `finally`
    // whether or not the request succeeded) but `data` stays null, and `readAt`
    // would read as `null` — indistinguishable from "never opened this thread".
    // Capturing that as the boundary would mark the whole history unread for
    // this viewing; waiting for real data means a retry or the next poll
    // captures the correct boundary instead.
    if (open && readBoundary === undefined && !isLoading && data !== null) {
        setReadBoundary(readAt);
        setBoundaryLatest(latest);
    }

    const messages: GameChatMessage[] = useMemo(() => rawMessages.map((message) => ({
        ...message,
        // `myId` is momentarily undefined before Clerk resolves; treating that
        // as "not mine" would flag the viewer's own already-read messages as
        // unread for a render.
        unread: myId !== undefined
            && message.senderId !== myId
            && readBoundary !== undefined
            && latest === boundaryLatest
            && (readBoundary === null || message.timestamp > readBoundary),
    })), [rawMessages, myId, readBoundary, latest, boundaryLatest]);

    // While the panel is open, advance the marker to the newest message — and
    // keep advancing it as the poll brings more in — so the dot never lights for
    // a line the player is looking at. A failed POST is logged and dropped: the
    // dot staying lit for another minute is the correct failure, and there is
    // nothing to retry that the next open won't do anyway.
    useEffect(() => {
        if (!open || latest === null || latest === readAt) {
            return;
        }
        fetch(`/api/game/${gameId}/chat/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ readAt: latest }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }).then((response) => {
            if (!response.ok) {
                console.error(`Failed to mark chat read: ${response.status}`);
            }
        }).catch((error) => {
            console.error('Failed to mark chat read', error);
        });
    }, [open, latest, readAt, gameId]);

    // Unread: a message that landed after the marker and came from someone else.
    // A browser that has never opened the thread (readAt null) treats every other
    // player's message as unread, which is the right first-time signal. This one
    // follows the live marker, not the frozen `readBoundary` above — the topbar
    // dot should clear the moment the marker does, unlike the panel's own
    // unread styling.
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

    return { messages, isLoading, isRefreshing, sending, hasUnread, send };
}
