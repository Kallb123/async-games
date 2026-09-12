import React from 'react';
import NamedChip from '@/components/ui/NamedChip';
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
 *
 * All this game owns is which dot and which name; the chip itself is the
 * shared `NamedChip`.
 */
export default function OutbreakCardChip({ cardId, stored = false, onTap, highlighted = false }: OutbreakCardChipProps) {
    const tappable = !!onTap && isCityCardId(cardId);

    return (
        <NamedChip
            indicator={<span className="ag-hand-card-dot" style={{ background: cardColor(cardId) }} />}
            label={`${cardName(cardId)}${stored ? ' ⭐' : ''}`}
            title={stored ? `${cardName(cardId)} · stored` : cardName(cardId)}
            onTap={tappable ? () => onTap(cardId) : undefined}
            highlighted={highlighted}
        />
    );
}
