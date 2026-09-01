'use client'
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import BackArrow from '@/components/ui/BackArrow';
import GameOptionsMenu, { GameOption } from '@/components/ui/GameOptionsMenu';
import MatchHistory, { MatchHistoryProps } from '@/components/games/MatchHistory';
import GameChat from '@/components/games/GameChat';
import { useGameChat } from '@/utils/hooks/useGameChat';

/** What a game hands `GameShell`'s `chat` prop: the game and its roster. The
 *  roster pair (parallel arrays, seat order) is how a message gets a name and a
 *  colour, since the response carries only `senderId` (docs/in-game-chat.md §5). */
export interface GameShellChat {
    gameId: string;
    userIdList: string[];
    usernameList: string[];
}

interface GameShellProps {
    /** Game name shown in the top bar. */
    title: string;
    /** Small status line under the title (turn, phase, time left…). */
    subtitle?: React.ReactNode;
    /** Where the back arrow goes. Defaults to the home dashboard. */
    backHref?: string;
    /** The game's own rows for the top-bar options menu, which the shell builds
     *  so it can add its own rows to it. Undefined — a game whose state hasn't
     *  arrived yet — renders no menu at all. */
    options?: GameOption[];
    /** A control for the top bar's right slot *instead of* the options menu
     *  (Train Time's ✕ while the claim sheet is open). */
    right?: React.ReactNode;
    /** True while a command is in flight — shows the sync pill in the top bar. */
    syncing?: boolean;
    /** The game's match-history log, behind the shell's own toggle. Omitted
     *  renders neither the toggle nor the panel. */
    log?: MatchHistoryProps;
    /** The game's chat thread. Omitted — or a single-seat game, where the roster
     *  has fewer than two players — renders no 💬 button and no panel, which is
     *  how Solitaire gets no chat without being named here. */
    chat?: GameShellChat;
    /** Extra class on the shell root, for a game that re-tints the chrome
     *  (Train Time's oxblood-and-brass rail livery). */
    className?: string;
    children: React.ReactNode;
}

/**
 * The shared "Game Night" in-game chrome — a dark top bar (back arrow,
 * title + status, options menu) wrapping a game's own board and actions.
 * Every game reuses this frame; only what goes inside is game-specific.
 *
 * The top bar also owns the one sync pill for the screen: whatever the player
 * tapped, there is exactly one place that says "your command is on its way",
 * so per-control feedback never has to stack up into competing spinners.
 *
 * It owns the turn-history log too: the toggle state, the menu row that flips
 * it and the panel itself all live here, so a game passes its lines in `log`
 * and gets the log every other game has. That is also why the shell builds the
 * options menu from `options` rather than taking a finished one — a row it owns
 * has to go in a list it can reach. This used to be three pasted pieces in each
 * of the eight board screens.
 *
 * It owns the chat thread the same way: a game passes its roster in `chat` and
 * gets the 💬 button (with its unread dot) and the panel below the board. The
 * fetch lives here, in `useGameChat`, and not in the panel, because the dot has
 * to know about messages while the panel is shut. A game with fewer than two
 * players passes no `chat`, or a roster too short to talk to, and gets neither.
 */
export default function GameShell({ title, subtitle, backHref = '/', options, right, syncing = false, log, chat, className = '', children }: GameShellProps) {
    const [showLog, setShowLog] = useState(false);
    const [showChat, setShowChat] = useState(false);

    // A game with fewer than two players (Solitaire) has no thread to read, so
    // the hook mounts but never fetches, and no button or panel renders.
    const hasChat = !!chat && chat.userIdList.length >= 2;
    const chatState = useGameChat(chat?.gameId ?? '', showChat, hasChat);

    // The thread opens below the board, at the bottom of the page — so on a tall
    // board the 💬 button can flip it on with nothing changing in view, reading
    // as a dead tap. Bring it into view when it opens (its top, so a later height
    // change as messages load doesn't move the target). Honour reduced motion,
    // the way the CSS animations do.
    const chatPanelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!showChat || !hasChat) {
            return;
        }
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        chatPanelRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }, [showChat, hasChat]);

    const shellOptions: GameOption[] = log ? [{
        key: 'history',
        label: 'Turn history',
        icon: '📜',
        active: showLog,
        onClick: () => setShowLog(v => !v),
    }] : [];

    return (
        <div className={`ag-game${className ? ` ${className}` : ''}`}>
            <div className="ag-game-topbar">
                <Link className="ag-game-topbar-btn" href={backHref} aria-label="Back"><BackArrow /></Link>
                <div className="ag-game-topbar-main">
                    <div className="ag-game-topbar-title">{title}</div>
                    {subtitle != null && <div className="ag-game-topbar-sub">{subtitle}</div>}
                </div>
                {syncing && (
                    <span className="ag-sync-pill" role="status">
                        <span className="ag-spinner ag-spinner--gold" />
                        SENDING
                    </span>
                )}
                {hasChat && (
                    <button
                        type="button"
                        className={`ag-game-topbar-btn${showChat ? ' ag-game-topbar-btn--on' : ''}`}
                        onClick={() => setShowChat(v => !v)}
                        aria-label="Chat"
                        aria-pressed={showChat}
                    >
                        💬
                        {/* An unread dot can't be seen inside a closed kebab menu,
                            which is why chat is a button and not a menu row. */}
                        {chatState.hasUnread && <span className="ag-topbar-dot" aria-hidden />}
                    </button>
                )}
                {right ?? (options && <GameOptionsMenu options={[...shellOptions, ...options]} />)}
            </div>
            {children}
            {log && showLog && <MatchHistory {...log} />}
            {hasChat && showChat && chat && (
                <div ref={chatPanelRef}>
                    <GameChat
                        messages={chatState.messages}
                        isLoading={chatState.isLoading}
                        isRefreshing={chatState.isRefreshing}
                        sending={chatState.sending}
                        send={chatState.send}
                        userIdList={chat.userIdList}
                        usernameList={chat.usernameList}
                    />
                </div>
            )}
        </div>
    );
}
