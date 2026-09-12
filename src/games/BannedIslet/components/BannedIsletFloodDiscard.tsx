'use client'
import React from 'react';
import BannedIsletChip from './BannedIsletChip';
import type { IBannedIsletPositionResponse } from '@/games/BannedIslet/apiModels';
import { tileName, BannedIsletTileId } from '@/games/BannedIslet/board';
import { positionOfTile } from '@/games/BannedIslet/rules';

interface BannedIsletFloodDiscardProps {
    /** In draw order, oldest first (docs/games/banned-islet.md §21.4). */
    floodDiscard: BannedIsletTileId[];
    /** The island, so a tile named here can be found on the board. */
    positions: IBannedIsletPositionResponse[];
    /** How many cards are still face down — the rest of the forecast. */
    floodDeckCount: number;
    /** Tapping a tile rings it on the board. */
    onTileTap?: (tile: BannedIsletTileId) => void;
    highlightedTile?: BannedIsletTileId | null;
}

/**
 * The flood discard as a first-class panel, not a footnote: §14.2 makes this
 * pile a *visible, growing, shrinking threat forecast* — every card in it is a
 * tile the sea has already taken a bite out of, and the next Waters Rise!
 * puts the whole pile straight back on top of the deck. §21.4 is emphatic
 * that it must be rendered rather than hidden, because reading it is the one
 * skill this design rewards.
 *
 * Most recently drawn first, matching the turn log's newest-first convention,
 * and with the tile's current state beside its name — a card here for a tile
 * that has since been shored up is a threat that was answered, and one for a
 * tile still flooded is a tile with one life left (§9.1).
 */
export default function BannedIsletFloodDiscard({
    floodDiscard,
    positions,
    floodDeckCount,
    onTileTap,
    highlightedTile = null,
}: BannedIsletFloodDiscardProps) {
    const cards = [...floodDiscard].reverse();

    return (
        <div className="ag-hand">
            <div className="ag-hand-head">
                <span className="ag-hand-title">Flood discard · {floodDiscard.length}</span>
                <span className="ag-hand-note">{floodDeckCount} still face down</span>
            </div>
            <div className="ag-hand-cards ag-hand-cards--wrap">
                {cards.length === 0
                    ? <span className="ag-hand-note">Empty — every card is still in the deck.</span>
                    : cards.map((tile, index) => {
                        const state = positions[positionOfTile(positions, tile)]?.state;
                        return (
                            <BannedIsletChip
                                key={`${tile}-${index}`}
                                glyph={state === 'flooded' ? '🌊' : '🏝️'}
                                label={tileName(tile)}
                                note={state === 'flooded' ? 'still flooded' : 'shored up again'}
                                onTap={onTileTap ? () => onTileTap(tile) : undefined}
                                highlighted={tile === highlightedTile}
                            />
                        );
                    })}
            </div>
        </div>
    );
}
