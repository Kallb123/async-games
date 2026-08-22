'use client'
import React from 'react';
import type { ITrainTimePlayerStateResponse } from '@/games/TrainTime/apiModels';
import { LONG_HAUL_BONUS, scoreBreakdown, totalScore } from '@/games/TrainTime/board';

export interface TrainTimeScoreRow {
    player: ITrainTimePlayerStateResponse;
    /** The player's rail colour, as the board and standings draw it. */
    colour: string;
    isMe: boolean;
    /** Whether the server named them the winner — the sheet doesn't judge. */
    isWinner: boolean;
}

interface TrainTimeScoreSheetProps {
    rows: TrainTimeScoreRow[];
    /** True when the server recorded a dead heat, so no single row is the winner. */
    sharedWin: boolean;
}

/**
 * The end-of-game scoring reveal (§7): what every player's total is actually
 * made of — track points banked as they claimed, the ticket haul turned face
 * up, and the Long Haul bonus for the longest continuous run of track. Shown
 * alongside the revealed tickets once the game is scored, because a Train Time
 * result is unreadable without the breakdown: the leader on track points
 * routinely loses to somebody whose tickets came in.
 */
export default function TrainTimeScoreSheet({ rows, sharedWin }: TrainTimeScoreSheetProps) {
    if (rows.length === 0) return null;

    // Highest total first, so the sheet reads as the final table.
    const ranked = [...rows].sort((a, b) => totalScore(b.player) - totalScore(a.player));

    return (
        <div className="ag-hand">
            <div className="ag-hand-head">
                <span className="ag-hand-title">Final scoring</span>
                <span className="ag-hand-note">
                    {sharedWin ? '🤝 Shared win' : `Long Haul +${LONG_HAUL_BONUS} for the longest run`}
                </span>
            </div>
            {ranked.map(({ player, colour, isMe, isWinner }) => (
                <div key={player.username} className="ag-list-row">
                    <span className="ag-tt-legend-rail" style={{ background: colour }} />
                    <div className="ag-list-row-main">
                        <div className="ag-list-row-title">{isMe ? 'You' : player.username}</div>
                        <div className="ag-list-row-sub">{scoreBreakdown(player).join(' · ')}</div>
                    </div>
                    <div className={`ag-tt-score-total${isWinner ? ' ag-tt-score-total--win' : ''}`}>
                        {totalScore(player)}
                    </div>
                </div>
            ))}
        </div>
    );
}
