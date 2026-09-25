import React from 'react';

interface EndTurnHandProps {
    drawn: React.ReactNode;
    drawnCount: number;
    hand: React.ReactNode;
    handCount: number;
}

/** The shared card snapshot beneath a co-op game's end-of-turn recap. */
export default function EndTurnHand({ drawn, drawnCount, hand, handCount }: EndTurnHandProps) {
    return (
        <div className="ag-end-turn-hand">
            <div className="ag-hand">
                <div className="ag-hand-head">
                    <span className="ag-hand-title">Drawn this turn</span>
                    <span className="ag-hand-note">{drawnCount}</span>
                </div>
                <div className="ag-hand-cards ag-hand-cards--wrap">{drawn}</div>
            </div>
            <div className="ag-hand">
                <div className="ag-hand-head">
                    <span className="ag-hand-title">Your hand now</span>
                    <span className="ag-hand-note">{handCount}</span>
                </div>
                <div className="ag-hand-cards ag-hand-cards--wrap">{hand}</div>
            </div>
        </div>
    );
}
