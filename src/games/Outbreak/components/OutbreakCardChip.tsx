import React from 'react';
import { cardColor, cardName, isCityCardId } from '@/games/Outbreak/board';

interface OutbreakCardChipProps {
    cardId: number;
    /** The Contingency Planner's stored card sits outside the hand limit. */
    stored?: boolean;
    /** City cards can be tapped to ring their city on the board; event cards
     *  name no location, so they never call this. */
    onTap?: (cityId: number) => void;
    /** Whether this card's city is the one currently ringed on the board. */
    highlighted?: boolean;
}

/**
 * One named card tile — a city or event card, dotted in its colour. Shared by
 * the per-player hand panel and the infection discard panel (§21.6 step 11),
 * both of which just need "what card is this" rendered compactly.
 */
export default function OutbreakCardChip({ cardId, stored = false, onTap, highlighted = false }: OutbreakCardChipProps) {
    const tappable = !!onTap && isCityCardId(cardId);
    const classes = ['ag-hand-card', 'ag-hand-card--named'];
    if (tappable) classes.push('ag-hand-card--tappable');
    if (tappable && highlighted) classes.push('ag-hand-card--highlighted');

    return (
        <div
            className={classes.join(' ')}
            title={stored ? `${cardName(cardId)} · stored` : cardName(cardId)}
            onClick={tappable ? () => onTap(cardId) : undefined}
            role={tappable ? 'button' : undefined}
        >
            <span className="ag-hand-card-dot" style={{ background: cardColor(cardId) }} />
            <span className="ag-hand-card-name">{cardName(cardId)}{stored ? ' ⭐' : ''}</span>
        </div>
    );
}
