'use client'
import React from 'react';
import Link from 'next/link';

interface GameShellProps {
    /** Game name shown in the top bar. */
    title: string;
    /** Small status line under the title (turn, phase, time left…). */
    subtitle?: React.ReactNode;
    /** Where the back arrow goes. Defaults to the home dashboard. */
    backHref?: string;
    /** Optional control rendered on the right of the top bar (e.g. a log toggle). */
    right?: React.ReactNode;
    /** True while a command is in flight — shows the sync pill in the top bar. */
    syncing?: boolean;
    children: React.ReactNode;
}

/**
 * The shared "Game Night" in-game chrome — a dark top bar (back arrow,
 * title + status, optional action) wrapping a game's own board and actions.
 * Every game reuses this frame; only what goes inside is game-specific.
 *
 * The top bar also owns the one sync pill for the screen: whatever the player
 * tapped, there is exactly one place that says "your command is on its way",
 * so per-control feedback never has to stack up into competing spinners.
 */
export default function GameShell({ title, subtitle, backHref = '/', right, syncing = false, children }: GameShellProps) {
    return (
        <div className="ag-game">
            <div className="ag-game-topbar">
                <Link className="ag-game-topbar-btn" href={backHref} aria-label="Back">←</Link>
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
                {right}
            </div>
            {children}
        </div>
    );
}
