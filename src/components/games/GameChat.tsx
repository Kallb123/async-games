'use client'
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import RecapTimeline from '@/components/ui/RecapTimeline';
import Refreshable from '@/components/ui/Refreshable';
import Skeleton from '@/components/ui/Skeleton';
import { playerColourForId } from '@/utils/ui/playerColours';
import { nameForUserId } from '@/utils/ui/players';
import { formatRelativeTime } from '@/utils/ui/time';
import { useNowToTheMinute } from '@/utils/hooks/useNow';
import { MAX_MESSAGE_LENGTH } from '@/utils/chat';
import type { GameChatMessage } from '@/utils/hooks/useGameChat';

interface GameChatProps {
    messages: GameChatMessage[];
    isLoading: boolean;
    isRefreshing: boolean;
    /** True while a send is in flight — disables the composer. */
    sending: boolean;
    /** POSTs the message; returns false if it was rejected or failed, so the
     *  composer keeps what the player typed. */
    send: (text: string) => Promise<boolean>;
    /** Closes the thread — the panel's own ✕, mirroring the top-bar 💬 toggle. */
    onClose: () => void;
    /** The game's roster in seat order, parallel arrays. A message carries only
     *  `senderId` (docs/in-game-chat.md §5), so its name and colour are resolved
     *  here from the roster the board already holds. */
    userIdList: string[];
    usernameList: string[];
}

// The in-game chat thread: the match-history timeline plus a composer, because a
// chat thread is the same picture as a match history at a third size. It reuses
// the `.ag-log` wrapper and `RecapTimeline` (compact) rather than growing new
// markup — a line is dotted in its sender's seat colour, titled with the message
// and detailed with the sender's name and a relative time, exactly as `TurnRecap`
// does. Presentational only: the fetch, the poll and the unread dot live in
// `GameShell`'s `useGameChat` (docs/in-game-chat.md §6).
//
// Message text is rendered as text — React escapes it; nothing here goes near
// dangerouslySetInnerHTML.
// Slack that still counts as "at the bottom" — a player doesn't have to be
// pixel-perfect for new messages to keep following them.
const SCROLL_BOTTOM_SLACK = 32;

export default function GameChat({ messages, isLoading, isRefreshing, sending, send, onClose, userIdList, usernameList }: GameChatProps) {
    const now = useNowToTheMinute();
    const [draft, setDraft] = useState('');

    // Follows the thread to its newest message when the player is already
    // looking at the bottom of it, the way a chat app is expected to; leaves the
    // scroll position alone if they've scrolled up to read history. Read via a
    // plain DOM listener rather than React state, since scroll position doesn't
    // need to drive a render — only whether the *next* one should jump.
    const isAtBottomRef = useRef(true);
    const listRef = useRef<HTMLOListElement | null>(null);
    const handleListScroll = useCallback(() => {
        const node = listRef.current;
        if (node) {
            isAtBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < SCROLL_BOTTOM_SLACK;
        }
    }, []);
    // React 19 detaches by running the returned cleanup rather than calling this
    // again with null (see useBannerHeight, which does the same for a native
    // observer) — so the listener is scoped to the node that was actually
    // passed in, not whatever `listRef.current` happens to hold by then.
    const attachListRef = useCallback((node: HTMLOListElement | null) => {
        if (!node) return;
        listRef.current = node;
        node.addEventListener('scroll', handleListScroll, { passive: true });
        return () => {
            listRef.current = null;
            node.removeEventListener('scroll', handleListScroll);
        };
    }, [handleListScroll]);
    // Applied in a layout effect, before paint, so a jump to the newest message
    // never shows as a visible snap after the new content has already rendered.
    // Keyed on the newest message's id, not the `messages` array itself: that
    // array gets a new identity on every poll response (`useGameChat`'s
    // `useMemo` recomputes it from a fresh `data` object each time), including
    // the idle ticks where nothing actually changed — keying on it would force
    // a scrollHeight read and scrollTop write every ten seconds the panel sits
    // open, not just when a message arrives.
    const newestMessageId = messages.length ? messages[messages.length - 1].messageId : null;
    useLayoutEffect(() => {
        const node = listRef.current;
        if (node && isAtBottomRef.current) {
            node.scrollTop = node.scrollHeight;
        }
    }, [newestMessageId]);

    const trimmed = draft.trim();
    const canSend = trimmed.length > 0 && trimmed.length <= MAX_MESSAGE_LENGTH && !sending;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSend) {
            return;
        }
        if (await send(draft)) {
            setDraft('');
        }
    };

    return (
        <div className="ag-log ag-chat-panel">
            <div className="ag-chat-head">
                <div className="ag-hand-title">Chat</div>
                <button type="button" className="ag-chat-close" onClick={onClose} aria-label="Close chat">✕</button>
            </div>
            {isLoading ? (
                <div className="ag-chat-skeleton" aria-hidden>
                    <Skeleton width="70%" height={14} />
                    <Skeleton width="55%" height={14} />
                    <Skeleton width="62%" height={14} />
                </div>
            ) : messages.length === 0 ? (
                <div className="ag-log-empty">No messages yet. Say hello.</div>
            ) : (
                <Refreshable isRefreshing={isRefreshing}>
                    <RecapTimeline
                        ref={attachListRef}
                        compact
                        events={messages.map((message, index) => ({
                            id: message.messageId,
                            dotColour: playerColourForId(message.senderId, userIdList),
                            title: message.text,
                            detail: [
                                nameForUserId({ userIdList, usernameList }, message.senderId),
                                formatRelativeTime(message.timestamp, now),
                            ].filter(Boolean).join(' · '),
                            // Marks where the messages new since this panel was last
                            // opened begin — only on the first of them, so a run of
                            // several unread lines gets one divider, not one each.
                            dividerBefore: message.unread && !messages[index - 1]?.unread ? 'New messages' : undefined,
                        }))}
                    />
                </Refreshable>
            )}
            <form className="ag-chat-composer" onSubmit={submit}>
                <input
                    className="ag-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Message…"
                    maxLength={MAX_MESSAGE_LENGTH}
                    aria-label="Chat message"
                />
                <button type="submit" className="ag-btn ag-btn--primary" disabled={!canSend}>
                    Send
                </button>
            </form>
        </div>
    );
}
