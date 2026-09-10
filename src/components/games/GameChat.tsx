'use client'
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Avatar from '@/components/ui/Avatar';
import ChatGif from '@/components/ui/ChatGif';
import AttachmentPicker, { AttachmentKind } from '@/components/games/AttachmentPicker';
import PanelHead from '@/components/ui/PanelHead';
import RecapTimeline, { RECAP_MARKER_SIZE } from '@/components/ui/RecapTimeline';
import Refreshable from '@/components/ui/Refreshable';
import Skeleton from '@/components/ui/Skeleton';
import { playerColourForId } from '@/utils/ui/playerColours';
import { nameForUserId } from '@/utils/ui/players';
import { formatRelativeTime } from '@/utils/ui/time';
import { useNowToTheMinute } from '@/utils/hooks/useNow';
import { useScrollIntoViewOnOpen } from '@/utils/hooks/useScrollIntoViewOnOpen';
import { IChatAttachment, IChatGifRef, MAX_MESSAGE_LENGTH } from '@/utils/chat';
import type { GameChatMessage } from '@/utils/hooks/useGameChat';

interface GameChatProps {
    messages: GameChatMessage[];
    isLoading: boolean;
    isRefreshing: boolean;
    /** True while a send is in flight — disables the composer. */
    sending: boolean;
    /** POSTs the message — text, a GIF or meme from one of the pickers, or
     *  both; returns false if it was rejected or failed, so the composer keeps
     *  what the player typed. */
    send: (text: string, gif?: IChatGifRef) => Promise<boolean>;
    /** There are messages older than the oldest one in `messages` — shows the
     *  "Load earlier" control above the first row. */
    hasMoreEarlier: boolean;
    /** True while a `loadEarlier` fetch is in flight — disables the control. */
    loadingEarlier: boolean;
    /** Fetches and prepends the previous page of the thread. */
    loadEarlier: () => Promise<void>;
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
// markup — a line is marked with its sender's `Avatar`, ringed in their seat
// colour, titled with the message and detailed with the sender's name and a
// relative time, exactly as `TurnRecap` does. The avatar sits where the
// timeline's plain colour dot does elsewhere (`marker`, not `dotColour`): a
// conversation is between people, so a face says whose line it is better than a
// swatch, and the ring keeps the seat colour a player is known by on the board.
// The badge is the initials one — the chat GET carries no image URL, and adding
// one would make the app's most-polled endpoint its chattiest Clerk caller
// (docs/in-game-chat.md §5).
//
// Presentational only: the fetch, the poll and the unread dot live in
// `GameShell`'s `useGameChat` (docs/in-game-chat.md §6).
//
// Message text is rendered as text — React escapes it; nothing here goes near
// dangerouslySetInnerHTML.
// Slack that still counts as "at the bottom" — a player doesn't have to be
// pixel-perfect for new messages to keep following them.
const SCROLL_BOTTOM_SLACK = 32;

/** The composer's two attachment toggles, one row apiece rather than one
 *  pasted `<button>` apiece — a GIF button and an image button open the same
 *  panel shape in the same place and differ only in these four strings
 *  (docs/chat-gifs.md §12). `AttachmentPicker`'s own `KIND_COPY` is the same
 *  move for the panel that opens underneath. */
const ATTACH_TOGGLES: { kind: AttachmentKind, label: string, openLabel: string, closeLabel: string }[] = [
    { kind: 'gif', label: 'GIF', openLabel: 'Send a GIF', closeLabel: 'Close GIF picker' },
    { kind: 'meme', label: 'IMG', openLabel: 'Send a meme', closeLabel: 'Close meme picker' },
];

/**
 * What goes in the timeline entry's `title` — which is already a
 * `React.ReactNode`, so an attachment row (a GIF or a meme, §12) needs nothing
 * from `RecapTimeline` and there is no second thread component
 * (docs/chat-gifs.md §6).
 *
 * Three shapes, and the third is the one worth naming: a message with neither
 * text nor an attachment. That isn't a message anybody can send — the POST
 * refuses it — but it is what the GET produces when a stored attachment no
 * longer validates and the sender wrote no caption (§4e), and it has to read as
 * "unavailable" rather than as a blank line. `ChatGif` owns that caption for
 * both it and an image that fails to load, so the string and its class have one
 * home.
 */
function messageTitle(message: GameChatMessage): React.ReactNode {
    if (!message.attachment && message.text) {
        return message.text;
    }
    return (
        <>
            <ChatGif attachment={message.attachment} />
            {message.text && <div className="ag-chat-gif-caption">{message.text}</div>}
        </>
    );
}

export default function GameChat({ messages, isLoading, isRefreshing, sending, send, hasMoreEarlier, loadingEarlier, loadEarlier, onClose, userIdList, usernameList }: GameChatProps) {
    const now = useNowToTheMinute();
    const [draft, setDraft] = useState('');
    // Which picker (if either) is open. A single slot rather than one flag per
    // kind: the two buttons open the same panel shape in the same place, so
    // tapping one while the other is open swaps the panel instead of stacking
    // a second one under the composer.
    const [openPicker, setOpenPicker] = useState<AttachmentKind | null>(null);
    const [attachSendFailed, setAttachSendFailed] = useState(false);
    // The in-flight guard for a tapped attachment is a ref, not the `sending`
    // prop: `pointer-events: none` on the busy grid stops a second *tap*, but
    // not a focused result being activated from the keyboard (key repeat on
    // Enter), and a state read can lag the second event. `useSubmitCommand`
    // guards its own POST the same way, for the same reason recorded as
    // finding 18 in docs/robustness-review.md.
    const sendingAttachmentRef = useRef(false);
    // The picker opens between the thread and the composer, so it pushes the
    // composer down — on a phone, far enough that a player who has just tapped
    // the button is looking at the wrong part of the page. The same hook brings
    // this panel into view that brings the chat panel itself in (GameShell).
    const pickerRef = useScrollIntoViewOnOpen(openPicker !== null);

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
    // again with null (see useHeightVar, which does the same for a native
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

    // A tapped result sends straight away, with whatever is in the box as its
    // caption — the same one-tap send a phone keyboard's GIF tab does, and the
    // reason there is no "attached" state to preview, remove or reconcile with
    // the draft. It closes the picker only on success: a refusal leaves the
    // grid up with a line saying so, because the useful next move may be
    // another result rather than the same one (a 400 means this row is gone
    // from the catalogue, and re-tapping it would 400 again).
    const sendAttachment = async (attachment: IChatAttachment) => {
        if (sendingAttachmentRef.current) {
            return;
        }
        sendingAttachmentRef.current = true;
        setAttachSendFailed(false);
        try {
            if (await send(draft, { provider: attachment.provider, mediaId: attachment.mediaId })) {
                setDraft('');
                setOpenPicker(null);
            } else {
                // Said out loud in the picker, because every way this
                // legitimately fails leaves nothing else on screen to notice: a
                // 400 for a row reaped between browsing and tapping, a 429 on
                // the GIF limiter, a POST that timed out. A retained draft is
                // what tells a player a *text* send failed; a tapped result
                // has no equivalent.
                setAttachSendFailed(true);
            }
        } finally {
            sendingAttachmentRef.current = false;
        }
    };

    return (
        <div className="ag-log ag-panel-open-pulse">
            <PanelHead title="Chat" subtitle="Latest at the bottom" onClose={onClose} closeLabel="Close chat" />
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
                    {hasMoreEarlier && (
                        <button
                            type="button"
                            className="ag-btn ag-btn--ghost ag-btn--block ag-chat-load-earlier"
                            onClick={() => loadEarlier()}
                            disabled={loadingEarlier}
                        >
                            {loadingEarlier ? 'Loading…' : 'Load earlier'}
                        </button>
                    )}
                    <RecapTimeline
                        ref={attachListRef}
                        compact
                        events={messages.map((message, index) => {
                            const senderName = nameForUserId({ userIdList, usernameList }, message.senderId);
                            return {
                                id: message.messageId,
                                marker: (
                                    <Avatar
                                        name={senderName}
                                        size={RECAP_MARKER_SIZE}
                                        ring={playerColourForId(message.senderId, userIdList)}
                                    />
                                ),
                                title: messageTitle(message),
                                detail: [
                                    senderName,
                                    formatRelativeTime(message.timestamp, now),
                                ].filter(Boolean).join(' · '),
                                // Marks where the messages new since this panel was last
                                // opened begin — only on the first of them, so a run of
                                // several unread lines gets one divider, not one each.
                                dividerBefore: message.unread && !messages[index - 1]?.unread ? 'New messages' : undefined,
                            };
                        })}
                    />
                </Refreshable>
            )}
            {openPicker && (
                <div ref={pickerRef}>
                    <AttachmentPicker
                        // Keyed on the kind, not just present because one is
                        // open: without it, switching GIF -> meme (or back)
                        // via the toggle buttons keeps the same component
                        // instance mounted, so its search box, results and
                        // "unavailable" state from the *other* kind would
                        // show through until the next debounced fetch landed.
                        // A fresh key forces the remount a close-then-reopen
                        // already gets for free.
                        key={openPicker}
                        kind={openPicker}
                        onSelect={sendAttachment}
                        onClose={() => setOpenPicker(null)}
                        sending={sending}
                        sendFailed={attachSendFailed}
                    />
                </div>
            )}
            <form className="ag-chat-composer" onSubmit={submit}>
                {ATTACH_TOGGLES.map(({ kind, label, openLabel, closeLabel }) => (
                    <button
                        key={kind}
                        type="button"
                        className={`ag-btn ag-btn--ghost ag-chat-attach-toggle${openPicker === kind ? ' ag-chat-attach-toggle--active' : ''}`}
                        // Disabled while a send is in flight, not just while
                        // this button's own picker is showing: `sending` is
                        // true for the whole of any send, text or attachment
                        // (useGameChat), so this is what stops a tap on the
                        // *other* button from swapping the panel out from
                        // under an in-flight send — sendAttachment's own
                        // completion handlers act on whichever picker happens
                        // to be open when the promise settles, so the panel
                        // must not be free to change underneath it.
                        disabled={sending}
                        onClick={() => {
                            setOpenPicker(open => open === kind ? null : kind);
                            // A failure banner from a previous send must not
                            // outlive the picker it was about — otherwise
                            // reopening (or switching kind) after any failed
                            // send in the session shows a stale "Couldn't
                            // send that…" before anything new has been tapped.
                            setAttachSendFailed(false);
                        }}
                        aria-expanded={openPicker === kind}
                        aria-label={openPicker === kind ? closeLabel : openLabel}
                    >
                        {label}
                    </button>
                ))}
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
