'use client'
import React from 'react';
import { TREASURES, treasureGlyph, treasureName, BannedIsletTreasureId } from '@/games/BannedIslet/board';
import type { IBannedIsletPositionResponse } from '@/games/BannedIslet/apiModels';
import { treasureTilesLeft } from '@/games/BannedIslet/rules';

interface BannedIsletTreasureTallyProps {
    /** 24 entries indexed by grid position (§5.1) — the island as the viewer sees it. */
    positions: IBannedIsletPositionResponse[];
    /** Which treasures are already aboard (§8): a captured one stops caring about its tiles. */
    treasures: Record<BannedIsletTreasureId, boolean>;
}

/**
 * The four treasures as a quadrant, one per figure, each reading how much of
 * its own island is left: "2" while both of its tiles are up, "1" once one has
 * gone for good, and a ✓ once it's aboard and the question stops mattering.
 *
 * This is the stat the team actually plays to. A total of tiles left says the
 * island is shrinking, which everyone can see; the number that ends the game
 * is per-treasure, because §4.2 loses it the moment *one* uncaptured
 * treasure's second tile sinks, with twenty other tiles still dry. A tile on
 * "1" is the tile to shore up this turn, and nothing else on screen says so.
 *
 * §17 applies as it does on the board: a treasure is told apart by its
 * silhouette, and a treasure in trouble by the number beside it. The red is
 * the third signal on top of two that already work in greyscale — never the
 * only one.
 */
export default function BannedIsletTreasureTally({ positions, treasures }: BannedIsletTreasureTallyProps) {
    return (
        <span className="ag-bi-tally">
            {TREASURES.map(treasure => {
                const captured = treasures[treasure.id];
                const left = treasureTilesLeft(positions, treasure.id);
                // Safe is the absence of a modifier — only the two states
                // worth recolouring carry one.
                const state = captured ? 'aboard' : left <= 1 ? 'danger' : null;
                const reading = captured
                    ? 'captured'
                    : `${left} of ${treasure.tiles.length} tiles left`;

                return (
                    <span
                        key={treasure.id}
                        className={`ag-bi-tally-item${state ? ` ag-bi-tally-item--${state}` : ''}`}
                        title={`${treasureName(treasure.id)} — ${reading}`}
                        aria-label={`${treasureName(treasure.id)}: ${reading}`}
                    >
                        <span className="ag-bi-tally-figure" aria-hidden="true">{treasureGlyph(treasure.id)}</span>
                        <span className="ag-stat-tally-n ag-bi-tally-n" aria-hidden="true">
                            {captured ? '✓' : `${left}/${treasure.tiles.length}`}
                        </span>
                    </span>
                );
            })}
        </span>
    );
}
