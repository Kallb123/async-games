'use client'
import React, { useState } from 'react';
import Collapse from '@/components/ui/Collapse';

export interface ScoreEntry {
    /** Stable key (usually the username). */
    id: string;
    /** Display name, or "You" for the viewer. */
    name: string;
    /** Player colour swatch. */
    color: string;
    /** Small status under the name (e.g. "🛣️ LR", "4 cards"). Whose turn it
     *  is comes from `isActive` — don't spell it out here too. Hidden while
     *  `detail` is showing (see below) rather than sitting above it — it's a
     *  summary of exactly the figures `detail` spells out in full, so
     *  showing both at once would just repeat the same line twice. */
    sub?: React.ReactNode;
    /** The big number on the right — victory points. */
    score: React.ReactNode;
    /** Tints the pill faintly — this is the viewer's own seat. */
    isMe?: boolean;
    /** It's this player's turn — draws the caret beside their name and rings
     *  the pill, the stronger of the two cues (deliberately: the viewer's own
     *  seat is already easy to find by position and its "You" label). */
    isActive?: boolean;
    /** Ring this player in the danger colour — they're about to end the game
     *  (Train Time's trains running out). */
    warn?: boolean;
    /** Tap this pill — e.g. to ring the player's location on the board. Makes
     *  the pill a button. */
    onClick?: () => void;
    /** This pill is the one currently selected — pulses in sync with whatever
     *  it highlights (Outbreak's board city). */
    highlighted?: boolean;
    /**
     * Extra per-player detail rows (e.g. cards held, knights played), shown
     * in place of `sub` once the strip is expanded. Any entry carrying this
     * is what makes the whole strip tappable — the strip expands and
     * collapses as one, not pill by pill, since it's one disclosure over
     * every seat.
     */
    detail?: React.ReactNode;
}

/**
 * Horizontal live scoreboard used inside the in-game shell: one pill per
 * player with their colour, name, a status line and their score. Generic
 * over what `sub`/`score` mean so any game can reuse it.
 *
 * When any entry carries `detail`, the whole strip becomes a single
 * disclosure: tapping anywhere on it reveals every pill's detail at once,
 * rather than each pill opening on its own.
 */
export default function GameScoreboard({ entries }: { entries: ScoreEntry[] }) {
    const [expanded, setExpanded] = useState(false);
    if (!entries.length) return null;
    const expandable = entries.some((e) => e.detail != null);
    const toggle = () => setExpanded((v) => !v);
    return (
        <div
            className={`ag-scorestrip${expandable ? ' ag-scorestrip--expandable' : ''}`}
            onClick={expandable ? toggle : undefined}
            role={expandable ? 'button' : undefined}
            tabIndex={expandable ? 0 : undefined}
            aria-expanded={expandable ? expanded : undefined}
            onKeyDown={expandable ? (ev) => { if (ev.key === 'Enter') toggle(); } : undefined}
        >
            {entries.map((e) => (
                <div
                    key={e.id}
                    className={`ag-score-pill${e.isMe ? ' ag-score-pill--me' : ''}${e.isActive ? ' ag-score-pill--active' : ''}${e.warn ? ' ag-score-pill--warn' : ''}${e.onClick ? ' ag-score-pill--tappable' : ''}${e.highlighted ? ' ag-score-pill--highlighted' : ''}`}
                    onClick={e.onClick ? (ev) => { ev.stopPropagation(); e.onClick!(); } : undefined}
                    role={e.onClick ? 'button' : undefined}
                    tabIndex={e.onClick ? 0 : undefined}
                    onKeyDown={e.onClick ? (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') e.onClick!(); } : undefined}
                >
                    <span className="ag-score-dot" style={{ background: e.color }} />
                    <div className="ag-score-main">
                        <div className="ag-score-name">
                            {/* Decorative: the shell subtitle already announces
                                whose move it is in prose. Sits before the name
                                so it survives the name's ellipsis. */}
                            {e.isActive && <span className="ag-score-turn" aria-hidden="true">▶</span>}
                            {e.name}
                        </div>
                        {/* The collapsed status line is a summary of the same
                            figures `detail` spells out — hidden once this
                            pill's detail is showing instead of stacking both. */}
                        {e.sub != null && !(expanded && e.detail != null) && <div className="ag-score-sub">{e.sub}</div>}
                        {expandable && (
                            <Collapse phase={expanded ? undefined : 'exit'}>
                                <div className="ag-score-detail">{e.detail}</div>
                            </Collapse>
                        )}
                    </div>
                    <div className="ag-score-vp">{e.score}</div>
                </div>
            ))}
        </div>
    );
}
