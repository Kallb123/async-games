'use client'
import React from 'react';

export interface ScoreEntry {
    /** Stable key (usually the username). */
    id: string;
    /** Display name, or "You" for the viewer. */
    name: string;
    /** Player colour swatch. */
    color: string;
    /** Small status under the name (e.g. "🛣️ LR", "4 cards"). Whose turn it
     *  is comes from `isActive` — don't spell it out here too. */
    sub?: React.ReactNode;
    /** The big number on the right — victory points. */
    score: React.ReactNode;
    isMe?: boolean;
    /** It's this player's turn — draws the caret beside their name. */
    isActive?: boolean;
    /** Ring this player in the danger colour — they're about to end the game
     *  (Train Time's trains running out). */
    warn?: boolean;
}

/**
 * Horizontal live scoreboard used inside the in-game shell: one pill per
 * player with their colour, name, a status line and their score. Generic
 * over what `sub`/`score` mean so any game can reuse it.
 */
export default function GameScoreboard({ entries }: { entries: ScoreEntry[] }) {
    if (!entries.length) return null;
    return (
        <div className="ag-scorestrip">
            {entries.map((e) => (
                <div key={e.id} className={`ag-score-pill${e.isMe ? ' ag-score-pill--me' : ''}${e.warn ? ' ag-score-pill--warn' : ''}`}>
                    <span className="ag-score-dot" style={{ background: e.color }} />
                    <div className="ag-score-main">
                        <div className="ag-score-name">
                            {/* Decorative: the shell subtitle already announces
                                whose move it is in prose. Sits before the name
                                so it survives the name's ellipsis. */}
                            {e.isActive && <span className="ag-score-turn" aria-hidden="true">▶</span>}
                            {e.name}
                        </div>
                        {e.sub != null && <div className="ag-score-sub">{e.sub}</div>}
                    </div>
                    <div className="ag-score-vp">{e.score}</div>
                </div>
            ))}
        </div>
    );
}
