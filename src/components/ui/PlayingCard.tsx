import React from 'react';
import { ICard, isRed, rankLabel, suitSymbol } from '@/utils/games/Cards';

interface PlayingCardProps {
    /** Undefined renders an empty dashed slot (e.g. a cleared foundation/column). */
    card?: ICard;
    size?: number;
    selected?: boolean;
    /** True while the move this card is part of is on its way to the server —
     *  the card wears the shared marching-ant pending skin. */
    pending?: boolean;
    onClick?: () => void;
    /** Small label shown under an empty slot (e.g. a foundation's suit). */
    placeholder?: React.ReactNode;
}

/**
 * A single playing card — face-up (rank + suit, red/black) or face-down (a
 * patterned back) — reusable by any card game. Mirrors the Dice/DieFace
 * pattern: presentational only, sized via props, no game logic.
 */
export default function PlayingCard({ card, size = 44, selected = false, pending = false, onClick, placeholder }: PlayingCardProps) {
    const style = { '--ag-pcard-size': `${size}px` } as React.CSSProperties;
    const stateClass = `${selected ? ' ag-pcard--selected' : ''}${pending ? ' ag-pending-skin' : ''}`;

    if (!card) {
        return (
            <div className="ag-pcard ag-pcard--empty" style={style} onClick={onClick} role={onClick ? 'button' : undefined}>
                {placeholder}
            </div>
        );
    }

    if (!card.faceUp) {
        return (
            <div
                className={`ag-pcard ag-pcard--back${stateClass}`}
                style={style}
                onClick={onClick}
                role={onClick ? 'button' : undefined}
                aria-label="Face-down card"
            />
        );
    }

    const red = card.suit ? isRed(card.suit) : false;
    return (
        <div
            className={`ag-pcard ag-pcard--face${red ? ' ag-pcard--red' : ' ag-pcard--black'}${stateClass}`}
            style={style}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            aria-label={card.rank && card.suit ? `${rankLabel(card.rank)} of ${card.suit}` : undefined}
        >
            <span className="ag-pcard-rank">{card.rank ? rankLabel(card.rank) : ''}</span>
            <span className="ag-pcard-suit">{card.suit ? suitSymbol(card.suit) : ''}</span>
        </div>
    );
}
