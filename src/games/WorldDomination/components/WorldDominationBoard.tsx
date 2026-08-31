'use client'
import React from 'react';
import BoardZoom from '@/components/ui/BoardZoom';
import ClickableMapNode from '@/components/ui/ClickableMapNode';
import MapEdges from '@/components/ui/MapEdges';
import MapLabelLayer from '@/components/ui/MapLabelLayer';
import type { IWorldDominationTerritoryResponse } from '@/games/WorldDomination/apiModels';
import { TERRITORIES, ADJACENCY, CONTINENT_ORDER, CONTINENTS, continentLabelAnchor, BOARD_VIEWBOX } from '@/games/WorldDomination/board';
import { edgeListFrom } from '@/utils/games/adjacencyGraph';
import { mapEdgeGeometry, wrapEdgeLabelRects } from '@/utils/ui/mapEdges';
import { circleRect } from '@/utils/ui/mapLabels';

interface WorldDominationBoardProps {
    territories: IWorldDominationTerritoryResponse[];
    // owner userId (as carried on territories) → colour / display name.
    colorForOwner: (owner: string | null) => string;
    nameForOwner: (owner: string) => string;
    onTerritoryClick?: (territoryId: number) => void;
    /** Territories the current tap target can legally be (highlighted ring). */
    validTerritories: Set<number>;
    /** A single already-chosen territory (e.g. the attack/fortify source). */
    selectedTerritoryId?: number | null;
    /** The most recent battle's two territories, for a brief front-line highlight. */
    frontLine?: { fromTerritoryId: number; toTerritoryId: number } | null;
    placementPrompt?: string | null;
}

const EDGE_LIST = edgeListFrom(ADJACENCY);
const CONTINENT_LABEL_OFFSET = 16;

// The wrapping edges' own labels sit at the map edges and never move, so the
// continent names have to be laid out around them too.
const WRAP_LABEL_RECTS = wrapEdgeLabelRects(TERRITORIES, EDGE_LIST, BOARD_VIEWBOX.width);

/** A territory's circle grows a little with the army stack it has to hold. */
function territoryRadius(armies: number): number {
    return 8.5 + Math.min(3, Math.floor(armies / 8));
}

export default function WorldDominationBoard({
    territories,
    colorForOwner,
    nameForOwner,
    onTerritoryClick,
    validTerritories,
    selectedTerritoryId = null,
    frontLine = null,
    placementPrompt = null,
}: WorldDominationBoardProps) {
    return (
        <div className="ag-board-frame ag-world-domination-frame">
            {placementPrompt && <div className="ag-board-tag">{placementPrompt}</div>}
            <BoardZoom zoomWidth="220%">
                <svg viewBox={`0 0 ${BOARD_VIEWBOX.width} ${BOARD_VIEWBOX.height}`}>
                    <image
                        href="/art/world-domination/world-domination-map.png"
                        x={0} y={0} width={BOARD_VIEWBOX.width} height={BOARD_VIEWBOX.height}
                        preserveAspectRatio="xMidYMid slice"
                    />

                    {/* Adjacency lines (cross-map edges wrap round the globe) */}
                    <MapEdges nodes={TERRITORIES} edges={EDGE_LIST} width={BOARD_VIEWBOX.width} />

                    {/* Front-line highlight from the last battle — wraps too when
                        the battle was across the map (e.g. Alaska ↔ Kamchatka) */}
                    {frontLine && mapEdgeGeometry(
                        TERRITORIES[frontLine.fromTerritoryId], TERRITORIES[frontLine.toTerritoryId], BOARD_VIEWBOX.width,
                    ).segments.map((s, i) => (
                        <line
                            key={i}
                            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                            stroke="#cf3b32" strokeWidth={2.5} strokeOpacity={0.8}
                        />
                    ))}

                    {/* Territories */}
                    {territories.map((t, id) => {
                        const def = TERRITORIES[id];
                        const color = colorForOwner(t.owner);
                        const isValid = validTerritories.has(id);
                        const isSelected = selectedTerritoryId === id;
                        const radius = territoryRadius(t.armies);
                        return (
                            <ClickableMapNode
                                key={id}
                                x={def.x} y={def.y} radius={radius}
                                isValid={isValid} isSelected={isSelected}
                                onClick={onTerritoryClick && (() => onTerritoryClick(id))}
                                title={<>{def.name} — {t.owner ? nameForOwner(t.owner) : 'unclaimed'} · {t.armies} armies</>}
                            >
                                <circle cx={def.x} cy={def.y} r={radius} fill={color} stroke="#fff" strokeWidth={1.3} />
                                <text x={def.x} y={def.y + 3.2} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">
                                    {t.armies}
                                </text>
                            </ClickableMapNode>
                        );
                    })}

                    {/* Continent name + bonus labels, outlined so they read over
                        the map art and laid out last so none of them lands on a
                        territory circle, another continent's name, or the edge
                        of the board. */}
                    <MapLabelLayer
                        labels={CONTINENT_ORDER.map(cid => {
                            const c = CONTINENTS[cid];
                            const anchor = continentLabelAnchor(cid);
                            return { key: cid, x: anchor.x, y: anchor.y, text: `${c.name.toUpperCase()} +${c.bonus}`, dir: 'se' as const, fill: c.color };
                        })}
                        obstacles={[
                            ...WRAP_LABEL_RECTS,
                            ...territories.map((t, id) => circleRect(TERRITORIES[id].x, TERRITORIES[id].y, territoryRadius(t.armies))),
                        ]}
                        width={BOARD_VIEWBOX.width} height={BOARD_VIEWBOX.height}
                        offset={CONTINENT_LABEL_OFFSET}
                        letterSpacingEm={0.04}
                    />
                </svg>
            </BoardZoom>
        </div>
    );
}
