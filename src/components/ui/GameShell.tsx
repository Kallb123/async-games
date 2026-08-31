'use client'
import React, { useState } from 'react';
import Link from 'next/link';
import BackArrow from '@/components/ui/BackArrow';
import GameOptionsMenu, { GameOption } from '@/components/ui/GameOptionsMenu';
import MatchHistory, { MatchHistoryProps } from '@/components/games/MatchHistory';

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
 */
export default function GameShell({ title, subtitle, backHref = '/', options, right, syncing = false, log, className = '', children }: GameShellProps) {
    const [showLog, setShowLog] = useState(false);

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
                {right ?? (options && <GameOptionsMenu options={[...shellOptions, ...options]} />)}
            </div>
            {children}
            {log && showLog && <MatchHistory {...log} />}
        </div>
    );
}
