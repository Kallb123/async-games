'use client'
import React, { useState } from 'react';
import { BOARD_VIEWBOX, CITIES, ROUTES, routeName } from '@/games/TrainTime/board';
import { CITY_LABEL_OFFSET, ROUTE_GEOMETRY, TRACK_BLOCK_HEIGHT, TRACK_PALETTE } from '@/games/TrainTime/ui';

interface TrainTimeBoardProps {
    /** Owning username per route id, null where unclaimed. */
    routeOwners: (string | null)[];
    usernameToColour: (username: string) => string;
    /** Routes the current player could claim right now (highlighted). */
    claimableRoutes: Set<number>;
    selectedRouteId: number | null;
    onRouteClick?: (routeId: number) => void;
    /** Short status pill in the corner of the map. */
    boardTag?: string | null;
}

/**
 * The Train Time map: 36 cities joined by 100 routes, each drawn as one
 * carriage block per train space in its card colour, or in the owner's player
 * colour once claimed. The map is wider than the app column, so it zooms and
 * scrolls rather than shrinking the tap targets to nothing.
 */
export default function TrainTimeBoard({
    routeOwners,
    usernameToColour,
    claimableRoutes,
    selectedRouteId,
    onRouteClick,
    boardTag = null,
}: TrainTimeBoardProps) {
    const [zoomed, setZoomed] = useState(false);

    return (
        <div className="ag-board-frame ag-tt-frame">
            {boardTag && <div className="ag-board-tag">{boardTag}</div>}
            <button
                type="button"
                className="ag-board-tag ag-board-tag--action"
                aria-pressed={zoomed}
                onClick={() => setZoomed(z => !z)}
            >
                {zoomed ? '➖ Fit map' : '➕ Zoom in'}
            </button>
            <div className="ag-tt-scroll">
                <svg
                    viewBox={`0 0 ${BOARD_VIEWBOX.width} ${BOARD_VIEWBOX.height}`}
                    style={{ width: zoomed ? '260%' : '100%' }}
                >
                    {ROUTES.map(route => {
                        const owner = routeOwners[route.id];
                        const palette = TRACK_PALETTE[route.colour];
                        const fill = owner ? usernameToColour(owner) : palette.fill;
                        const stroke = owner ? '#2f3f4d' : palette.stroke;
                        const claimable = claimableRoutes.has(route.id);
                        const selected = selectedRouteId === route.id;
                        const geometry = ROUTE_GEOMETRY[route.id];
                        return (
                            <g
                                key={route.id}
                                onClick={onRouteClick && claimable ? () => onRouteClick(route.id) : undefined}
                                style={{ cursor: onRouteClick && claimable ? 'pointer' : 'default' }}
                            >
                                <title>{routeName(route)} — {route.length} × {route.colour}{owner ? ` · ${owner}` : ''}</title>
                                {geometry.blocks.map((block, i) => (
                                    <rect
                                        key={i}
                                        x={-block.width / 2}
                                        y={-TRACK_BLOCK_HEIGHT / 2}
                                        width={block.width}
                                        height={TRACK_BLOCK_HEIGHT}
                                        rx={4}
                                        fill={fill}
                                        stroke={selected ? '#1d2733' : stroke}
                                        strokeWidth={selected ? 3 : 1.2}
                                        opacity={owner || claimable || selectedRouteId === null ? 1 : 0.55}
                                        transform={`translate(${block.x.toFixed(2)},${block.y.toFixed(2)}) rotate(${block.angle.toFixed(2)})`}
                                    />
                                ))}
                                {claimable && !selected && (
                                    <path d={geometry.path} fill="none" stroke="var(--ag-gold)" strokeWidth={20} strokeOpacity={0.22} strokeLinecap="round" />
                                )}
                                {/* Fat invisible tap target, so a 1-space route is still hittable. */}
                                <path d={geometry.path} fill="none" stroke="transparent" strokeWidth={18} />
                            </g>
                        );
                    })}

                    {CITIES.map(city => {
                        const label = CITY_LABEL_OFFSET[city.labelDir];
                        return (
                            <g key={city.id}>
                                <circle cx={city.x} cy={city.y} r={8.5} fill="#fffdf9" stroke="#2f3f4d" strokeWidth={2.4} />
                                <text
                                    x={city.x + label.dx}
                                    y={city.y + label.dy}
                                    textAnchor={label.anchor}
                                    fontSize={14}
                                    fontWeight={700}
                                    fill="#26333f"
                                    stroke="#dcecf7"
                                    strokeWidth={4}
                                    paintOrder="stroke"
                                    strokeLinejoin="round"
                                >
                                    {city.name}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
}
