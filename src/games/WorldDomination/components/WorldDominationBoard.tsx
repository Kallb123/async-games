'use client'
import React from 'react';
import BoardZoom from '@/components/ui/BoardZoom';
import type { IWorldDominationTerritoryResponse } from '@/games/WorldDomination/apiModels';
import { TERRITORIES, ADJACENCY, CONTINENT_ORDER, CONTINENTS, continentLabelAnchor, BOARD_VIEWBOX } from '@/games/WorldDomination/board';

interface WorldDominationBoardProps {
    territories: IWorldDominationTerritoryResponse[];
    usernameToColor: (username: string | null) => string;
    onTerritoryClick?: (territoryId: number) => void;
    /** Territories the current tap target can legally be (highlighted ring). */
    validTerritories: Set<number>;
    /** A single already-chosen territory (e.g. the attack/fortify source). */
    selectedTerritoryId?: number | null;
    /** The most recent battle's two territories, for a brief front-line highlight. */
    frontLine?: { fromTerritoryId: number; toTerritoryId: number } | null;
    placementPrompt?: string | null;
}

// Dedupe the adjacency graph into one edge per pair for line-drawing.
const EDGE_LIST: [number, number][] = (() => {
    const seen = new Set<string>();
    const edges: [number, number][] = [];
    ADJACENCY.forEach((neighbours, from) => {
        neighbours.forEach(to => {
            const key = from < to ? `${from}-${to}` : `${to}-${from}`;
            if (seen.has(key)) return;
            seen.add(key);
            edges.push([from, to]);
        });
    });
    return edges;
})();

export default function WorldDominationBoard({
    territories,
    usernameToColor,
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

                    {/* Continent name + bonus labels (outlined so they read over the map art) */}
                    {CONTINENT_ORDER.map(cid => {
                        const c = CONTINENTS[cid];
                        const anchor = continentLabelAnchor(cid);
                        return (
                            <text
                                key={cid}
                                x={anchor.x + 10} y={anchor.y + 16} fontSize={9} fontWeight={800} letterSpacing="0.04em"
                                fill={c.color} stroke="rgba(0,0,0,0.6)" strokeWidth={3} paintOrder="stroke"
                            >
                                {c.name.toUpperCase()} +{c.bonus}
                            </text>
                        );
                    })}

                    {/* Adjacency lines */}
                    <g stroke="#fff" strokeWidth={1} strokeOpacity={0.5}>
                        {EDGE_LIST.map(([a, b]) => (
                            <line key={`${a}-${b}`} x1={TERRITORIES[a].x} y1={TERRITORIES[a].y} x2={TERRITORIES[b].x} y2={TERRITORIES[b].y} />
                        ))}
                    </g>

                    {/* Front-line highlight from the last battle */}
                    {frontLine && (
                        <line
                            x1={TERRITORIES[frontLine.fromTerritoryId].x} y1={TERRITORIES[frontLine.fromTerritoryId].y}
                            x2={TERRITORIES[frontLine.toTerritoryId].x} y2={TERRITORIES[frontLine.toTerritoryId].y}
                            stroke="#cf3b32" strokeWidth={2.5} strokeOpacity={0.8}
                        />
                    )}

                    {/* Territories */}
                    {territories.map((t, id) => {
                        const def = TERRITORIES[id];
                        const color = usernameToColor(t.owner);
                        const isValid = validTerritories.has(id);
                        const isSelected = selectedTerritoryId === id;
                        const clickable = !!onTerritoryClick && (isValid || isSelected);
                        const radius = 8.5 + Math.min(3, Math.floor(t.armies / 8));
                        return (
                            <g
                                key={id}
                                onClick={() => clickable && onTerritoryClick?.(id)}
                                style={{ cursor: clickable ? 'pointer' : 'default' }}
                            >
                                <title>{def.name} — {t.owner ?? 'unclaimed'} · {t.armies} armies</title>
                                {isValid && (
                                    <circle cx={def.x} cy={def.y} r={radius + 4.5} fill="none" stroke="var(--ag-gold)" strokeWidth={2.5} />
                                )}
                                {isSelected && (
                                    <circle cx={def.x} cy={def.y} r={radius + 4.5} fill="none" stroke="#fff" strokeWidth={2.5} />
                                )}
                                <circle cx={def.x} cy={def.y} r={radius} fill={color} stroke="#fff" strokeWidth={1.3} />
                                <text x={def.x} y={def.y + 3.2} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">
                                    {t.armies}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </BoardZoom>
        </div>
    );
}
