'use client'
import React from 'react';
import type { IRiskTerritoryResponse } from '@/games/Risk/apiModels';
import { TERRITORIES, ADJACENCY, CONTINENT_ORDER, CONTINENTS, continentBoundingBox, BOARD_VIEWBOX } from '@/games/Risk/board';

interface RiskBoardProps {
    territories: IRiskTerritoryResponse[];
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

export default function RiskBoard({
    territories,
    usernameToColor,
    onTerritoryClick,
    validTerritories,
    selectedTerritoryId = null,
    frontLine = null,
    placementPrompt = null,
}: RiskBoardProps) {
    return (
        <div className="ag-board-frame ag-risk-frame">
            {placementPrompt && <div className="ag-board-tag">{placementPrompt}</div>}
            <svg viewBox={`0 0 ${BOARD_VIEWBOX.width} ${BOARD_VIEWBOX.height}`}>
                {/* Continent regions */}
                {CONTINENT_ORDER.map(cid => {
                    const c = CONTINENTS[cid];
                    const box = continentBoundingBox(cid);
                    return (
                        <g key={cid}>
                            <rect
                                x={box.x} y={box.y} width={box.width} height={box.height} rx={22}
                                fill={c.color} fillOpacity={0.16} stroke={c.color} strokeOpacity={0.45} strokeWidth={1.5}
                            />
                            <text x={box.x + 10} y={box.y + 16} fontSize={9} fontWeight={800} letterSpacing="0.04em" fill={c.color}>
                                {c.name.toUpperCase()} +{c.bonus}
                            </text>
                        </g>
                    );
                })}

                {/* Adjacency lines */}
                <g stroke="#7a5f2e" strokeWidth={1} strokeOpacity={0.35}>
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
        </div>
    );
}
