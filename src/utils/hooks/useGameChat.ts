'use client'
import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRefreshableData } from "./useRefreshableData";
import { REQUEST_TIMEOUT_MS } from "./fetchWithSessionRetry";
import { CHAT_EVENTS } from "./usePushEvents";
import { useStoredValue } from "./useStoredValue";
import { normaliseMessage } from "@/utils/chat";
import type { IChatResponse, IChatMessageResponse } from "@/app/api/game/[gameid]/chat/route";

export interface GameChat {
    messages: IChatMessageResponse[];
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
 */
export function useGameChat(gameId: string, open: boolean, enabled: boolean): GameChat {
    const { user } = useUser();
    const myId = user?.id;
    const { data, isLoading, isRefreshing, refresh } =
        useRefreshableData<IChatResponse>(`/api/game/${gameId}/chat`, CHAT_EVENTS, { pollWhileWatching: open, enabled });
    const [sending, setSending] = useState(false);
    // The read marker: the timestamp of the newest message this browser has seen
    // in this game. Per-device (localStorage) — reading on your phone leaves the
    // dot on your laptop, the known cost a server-side marker (phase 2) would
    // pay off. See docs/in-game-chat.md §6.
    const [readAt, setReadAt] = useStoredValue(`ag-chat-read:${gameId}`);

    const messages = data?.messages ?? [];
    const latest = messages.length ? messages[messages.length - 1].timestamp : null;

    // While the panel is open, advance the marker to the newest message — and
    // keep advancing it as the poll brings more in — so the dot never lights for
    // a line the player is looking at.
    useEffect(() => {
        if (open && latest !== null && latest !== readAt) {
            setReadAt(latest);
        }
    }, [open, latest, readAt, setReadAt]);

    // Unread: a message that landed after the marker and came from someone else.
    // A browser that has never opened the thread (readAt null) treats every other
    // player's message as unread, which is the right first-time signal.
    const hasUnread = messages.some(
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
