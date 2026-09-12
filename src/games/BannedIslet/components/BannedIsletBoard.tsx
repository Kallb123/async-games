'use client'
import React from 'react';
import {
    GRID_SIZE,
    PIER_GLYPH,
    PIER_TILE,
    TREASURES,
    positionAt,
    tileName,
    treasureGlyph,
    treasureName,
    BannedIsletTileId,
    BannedIsletTreasureId,
} from '@/games/BannedIslet/board';
import type { IBannedIsletPlayerStateResponse, IBannedIsletPositionResponse } from '@/games/BannedIslet/apiModels';
import { playerColourForId } from '@/utils/ui/playerColours';

// The island: §5.1's diamond of 24 tiles cut out of a 6 × 6 grid, drawn as one
// CSS grid inside `ag-board-frame` — the shape FiresOutBoard.tsx takes, and
// not the SVG node map the other co-ops use. Adjacency here is implied by
// position and never drawn (docs/games/banned-islet.md §21.1), so there are no
// edges to lay out; the 12 cells the diamond doesn't cover are open sea.
//
// §17 is the rule this file is really written to. Three things follow from it:
//
//  * **A tile's state is its face, not its tint.** Dry is dry land — sand over
//    rock. Flooded is water over the same tile, with its own surface *and* the
//    🌊 marker in the corner. Sunk is an absent tile: a hole in the island with
//    nothing drawn in it at all, which is the strongest of the three signals
//    and the one the whole design is about (§5.1's "a sunk tile leaves a
//    hole"). None of the three can be mistaken for another in greyscale.
//  * **A treasure is a silhouette**, not a colour — `treasureGlyph` in
//    board.ts, the same figure the cards that buy it wear.
//  * **Every tile is named on its face.** The island is 24 shuffled tiles and
//    the flood discard names them, so a player reading "Kelp Stair went under"
//    has to be able to find Kelp Stair without tapping anything.
//
// The tile faces are drawn in CSS (see `.ag-bi-*` in ag-theme.css). The
// hand-drawn art of §21.6's last PR replaces those faces and nothing else:
// the icons, the names and the hole stay regardless, because they are what
// §17 asks for rather than decoration on top of it.

interface BannedIsletBoardProps {
    /** 24 entries indexed by grid position (§5.1) — which tile is there, and what state it is in. */
    positions: IBannedIsletPositionResponse[];
    playerStates: { [userId: string]: IBannedIsletPlayerStateResponse };
    /** Every player id in join order — pawn colours follow it, so a pawn matches its scoreboard pill. */
    userIdList: string[];
    /** Which treasures are already aboard (§8): a captured figure comes off the island. */
    treasures: Record<BannedIsletTreasureId, boolean>;
    /** Positions the pending action can legally target — the tappable ones. */
    validPositions: Set<number>;
    onPositionClick?: (position: number) => void;
    /** What the board is asking for right now, if anything ("Choose a tile to move to"). */
    boardTag?: string | null;
    /** Whose pawn is up — ringed, so a four-pawn tile still says who is acting. */
    activeUserId?: string | null;
    /** The tile a tapped flood-discard card is pointing at — rung here, including the hole a sunk one left behind. */
    highlightedPosition?: number | null;
}

/** The treasure still standing on this tile, if any — a captured one has left the island. */
function treasureOnTile(tile: BannedIsletTileId, treasures: Record<BannedIsletTreasureId, boolean>): BannedIsletTreasureId | null {
    const treasure = TREASURES.find(t => t.tiles.includes(tile));
    return treasure && !treasures[treasure.id] ? treasure.id : null;
}

export default function BannedIsletBoard({
    positions,
    playerStates,
    userIdList,
    treasures,
    validPositions,
    onPositionClick,
    boardTag = null,
    activeUserId = null,
    highlightedPosition = null,
}: BannedIsletBoardProps) {
    // Pawns keyed by the position they stand on — several share a tile often
    // enough (every Give a Treasure Card is two pawns on one tile, §8).
    const pawnsAt = new Map<number, string[]>();
    Object.values(playerStates).forEach(ps => pawnsAt.set(ps.position, [...(pawnsAt.get(ps.position) ?? []), ps.userId]));

    const cells: React.ReactNode[] = [];
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            const position = positionAt(row, col);

            // Open sea: outside the diamond, and never a tile that was there.
            // A position the island doesn't carry draws as sea too rather than
            // throwing — the board renders replayed states as well as live
            // ones, and a short `positions` array must not take the screen down.
            if (position === null || !positions[position]) {
                cells.push(<div key={`sea-${row}-${col}`} className="ag-bi-cell ag-bi-cell--sea" aria-hidden="true" />);
                continue;
            }

            const { tile, state } = positions[position];
            const sunk = state === 'sunk';
            const isValid = validPositions.has(position);
            const pawns = pawnsAt.get(position) ?? [];
            const treasure = sunk ? null : treasureOnTile(tile, treasures);
            const label = `${tileName(tile)} — ${sunk ? 'sunk' : state}`;

            cells.push(
                <button
                    key={position}
                    type="button"
                    className={`ag-bi-cell ag-bi-cell--${state}${isValid ? ' ag-bi-cell--valid' : ''}${position === highlightedPosition ? ' ag-bi-cell--highlighted' : ''}`}
                    disabled={!isValid}
                    onClick={isValid && onPositionClick ? () => onPositionClick(position) : undefined}
                    title={label}
                    aria-label={label}
                >
                    {/* A sunk tile draws nothing: it is not there. Its name
                        would be a tile a player could still plan through. */}
                    {!sunk && (
                        <>
                            {state === 'flooded' && <span className="ag-bi-state" aria-hidden="true">🌊</span>}
                            {tile === PIER_TILE && <span className="ag-bi-figure ag-bi-figure--pier" aria-hidden="true">{PIER_GLYPH}</span>}
                            {treasure && (
                                <span className="ag-bi-figure" aria-hidden="true" title={treasureName(treasure)}>
                                    {treasureGlyph(treasure)}
                                </span>
                            )}
                            <span className="ag-bi-name">{tileName(tile)}</span>
                        </>
                    )}
                    {pawns.length > 0 && (
                        <span className="ag-bi-pawns">
                            {pawns.map(userId => (
                                <span
                                    key={userId}
                                    className={`ag-bi-pawn${userId === activeUserId ? ' ag-bi-pawn--active' : ''}`}
                                    style={{ background: playerColourForId(userId, userIdList) }}
                                    title={playerStates[userId]?.username}
                                />
                            ))}
                        </span>
                    )}
                </button>,
            );
        }
    }

    return (
        <div className="ag-board-frame ag-bannedislet-frame">
            {boardTag && <div className="ag-board-tag">{boardTag}</div>}
            <div className="ag-bi-grid">{cells}</div>
        </div>
    );
}
