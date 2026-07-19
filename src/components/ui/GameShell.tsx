'use client'
import React from 'react';

interface GameShellProps {
    /** Game name shown in the top bar. */
    title: string;
    /** Small status line under the title (turn, phase, time left…). */
    subtitle?: React.ReactNode;
    /** Where the back arrow goes. Defaults to the home dashboard. */
    backHref?: string;
    /** Optional control rendered on the right of the top bar (e.g. a log toggle). */
    right?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * The shared "Game Night" in-game chrome — a dark top bar (back arrow,
 * title + status, optional action) wrapping a game's own board and actions.
 * Every game reuses this frame; only what goes inside is game-specific.
 */
export default function GameShell({ title, subtitle, backHref = '/', right, children }: GameShellProps) {
    return (
        <div className="ag-game">
            <div className="ag-game-topbar">
                <a className="ag-game-topbar-btn" href={backHref} aria-label="Back">←</a>
                <div className="ag-game-topbar-main">
                    <div className="ag-game-topbar-title">{title}</div>
                    {subtitle != null && <div className="ag-game-topbar-sub">{subtitle}</div>}
                </div>
                {right}
            </div>
            {children}
        </div>
    );
}
