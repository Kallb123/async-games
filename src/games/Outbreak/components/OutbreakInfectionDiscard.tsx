import React from 'react';
import OutbreakCardChip from './OutbreakCardChip';

interface OutbreakInfectionDiscardProps {
    /** In draw order, oldest first — §14.2's most-read pile, so it deserves a
     *  panel of its own rather than being folded into the log. */
    infectionDiscard: number[];
    /** Tapping a card rings that city on the board. */
    onCardTap?: (cityId: number) => void;
    highlightedCityId?: number | null;
}

/**
 * The infection discard pile as a first-class panel (§21.6 step 11), not a
 * footnote: every card in it is a colour that has already hit the board, and
 * — since §9.1's Intensify reshuffles this pile straight back into the draw
 * pile — the strongest public signal for where the next wave lands. Most
 * recently infected first, matching the log's newest-first convention.
 */
export default function OutbreakInfectionDiscard({ infectionDiscard, onCardTap, highlightedCityId = null }: OutbreakInfectionDiscardProps) {
    const cards = [...infectionDiscard].reverse();

    return (
        <div className="ag-hand">
            <div className="ag-hand-head">
                <span className="ag-hand-title">Infection discard · {infectionDiscard.length}</span>
                <span className="ag-hand-note">most recent first</span>
            </div>
            <div className="ag-hand-cards ag-hand-cards--wrap">
                {cards.length === 0
                    ? <span className="ag-hand-note">Empty.</span>
                    : cards.map((cityId, i) => (
                        <OutbreakCardChip
                            key={`${cityId}-${i}`}
                            cardId={cityId}
                            onTap={onCardTap}
                            highlighted={cityId === highlightedCityId}
                        />
                    ))}
            </div>
        </div>
    );
}
