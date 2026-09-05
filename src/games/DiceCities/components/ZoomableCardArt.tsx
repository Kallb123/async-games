'use client'

import React, { useState } from 'react';
import type { IDiceCitiesCard } from '@/games/DiceCities/apiModels';
import CardArt, { ART_HEIGHT, ART_WIDTH } from '@/games/DiceCities/components/CardArt';
import DiceCitiesCardModal from '@/games/DiceCities/components/DiceCitiesCardModal';
import type { DiceCitiesTheme } from '@/games/DiceCities/themes';

interface ZoomableCardArtProps {
    card: IDiceCitiesCard;
    /** Only the popup needs it: the card carries its own name and picture, but
     *  what a landmark is *called* belongs to the theme rather than to a card. */
    theme: DiceCitiesTheme;
    /** The ag-* class that sizes the slot this art sits in. */
    className: string;
}

/**
 * A card's art, tappable to read the card. Everything a card face says — the
 * number it pays on, its name, its cost, its rules text — is printed on the
 * illustration, and none of it survives being drawn at the size a city or a
 * market grid can afford, so the thumbnail is a shape you recognise and this
 * opens the rest.
 *
 * Used wherever the art stands on its own: the city tableau, the landmark
 * track, the market. Where it already sits inside a control whose tap means
 * something else — a Business Center pick card, a landmark buy row — the plain
 * `CardArt` goes in instead, and those cards enlarge from the tableau and the
 * track. Owning the popup here rather than at each of those callsites is what
 * keeps the state and the wiring out of the board and the turn sheet.
 */
export default function ZoomableCardArt({ card, theme, className }: ZoomableCardArtProps) {
    const [zoomed, setZoomed] = useState(false);

    return (
        <>
            {/* Deliberately not a <button>: off your turn the market sits inside
                ReadOnlyPanel's disabled fieldset, which would take a real
                control out of play — and reading the cards on offer is exactly
                what a waiting player is there to do. */}
            <span
                className={`ag-dc-cardzoom ${className}`}
                style={{ '--ag-dc-art-ratio': `${ART_WIDTH} / ${ART_HEIGHT}` } as React.CSSProperties}
                role="button"
                tabIndex={0}
                title={`${card.title} · tap to enlarge`}
                aria-label={`Enlarge ${card.title}`}
                onClick={() => setZoomed(true)}
                onKeyDown={(e) => { if (e.key === 'Enter') setZoomed(true); }}
            >
                <span className="ag-dc-cardzoom-art">
                    <CardArt card={card} className="ag-dc-cardzoom-img" />
                </span>
            </span>
            {zoomed && <DiceCitiesCardModal card={card} theme={theme} onClose={() => setZoomed(false)} />}
        </>
    );
}
