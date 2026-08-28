import React from 'react';
import { cardColor, cardName } from '@/games/Outbreak/board';

interface OutbreakCardChipProps {
    cardId: number;
    /** The Contingency Planner's stored card sits outside the hand limit. */
    stored?: boolean;
}

/**
 * One named card tile — a city or event card, dotted in its colour. Shared by
 * the per-player hand panel and the infection discard panel (§21.6 step 11),
 * both of which just need "what card is this" rendered compactly.
 */
export default function OutbreakCardChip({ cardId, stored = false }: OutbreakCardChipProps) {
    return (
        <div className="ag-hand-card ag-hand-card--named" title={stored ? `${cardName(cardId)} · stored` : cardName(cardId)}>
            <span className="ag-hand-card-dot" style={{ background: cardColor(cardId) }} />
            <span className="ag-hand-card-name">{cardName(cardId)}{stored ? ' ⭐' : ''}</span>
        </div>
    );
}
