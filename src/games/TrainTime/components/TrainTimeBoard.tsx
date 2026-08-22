'use client'
import React, { useState } from 'react';
import { BOARD_VIEWBOX, CITIES, ROUTES, routeName } from '@/games/TrainTime/board';
import { CITY_LABEL_OFFSET, ROUTE_GEOMETRY, TRACK_PALETTE } from '@/games/TrainTime/ui';

interface TrainTimeBoardProps {
    /** Owning username per route id, null where unclaimed. */
    routeOwners: (string | null)[];
    usernameToColour: (username: string) => string;
    /** Routes the current player could claim right now — the tappable ones. */
    claimableRoutes: Set<number>;
    /** Light up those routes and step everything else back, while the player
     *  is actually choosing one. */
    highlightClaimable?: boolean;
    selectedRouteId: number | null;
    onRouteClick?: (routeId: number) => void;
    /** Short status pill in the corner of the map. */
    boardTag?: string | null;
}

// Sized for the 1240-wide board viewBox, so the printed track reads as chunky
// dashes at the width the app column actually renders it.
const TRACK_WIDTH = 10;
const CLAIMED_TRACK_WIDTH = 13;

/**
 * The Train Time map, drawn as a printed rail chart on parchment: 36 cities
 * joined by 100 runs of dashed track, one dash per train space, inked in the
 * route's card colour until somebody claims it and it turns their own. The
 * map is wider than the app column, so it zooms and scrolls rather than
 * shrinking the tap targets to nothing.
 */
export default function TrainTimeBoard({
    routeOwners,
    usernameToColour,
    claimableRoutes,
    highlightClaimable = false,
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
                        const claimable = claimableRoutes.has(route.id);
                        const selected = selectedRouteId === route.id;
                        const { trackPath, dashArray } = ROUTE_GEOMETRY[route.id];
                        return (
                            <g
                                key={route.id}
                                onClick={onRouteClick && claimable ? () => onRouteClick(route.id) : undefined}
                                style={{ cursor: onRouteClick && claimable ? 'pointer' : 'default' }}
                            >
                                <title>{routeName(route)} — {route.length} × {route.colour}{owner ? ` · ${owner}` : ''}</title>
                                {(selected || (highlightClaimable && claimable)) && (
                                    <path
                                        d={trackPath}
                                        fill="none"
                                        stroke="var(--tt-brass)"
                                        strokeWidth={selected ? 26 : 18}
                                        strokeOpacity={selected ? 0.55 : 0.2}
                                        strokeLinecap="round"
                                    />
                                )}
                                <path
                                    d={trackPath}
                                    fill="none"
                                    stroke={owner ? usernameToColour(owner) : TRACK_PALETTE[route.colour].fill}
                                    strokeWidth={owner ? CLAIMED_TRACK_WIDTH : TRACK_WIDTH}
                                    strokeDasharray={dashArray}
                                    strokeOpacity={owner || claimable ? 1 : highlightClaimable ? 0.28 : 0.75}
                                />
                                {/* Fat invisible tap target, so a 1-space route is still hittable. */}
                                <path d={trackPath} fill="none" stroke="transparent" strokeWidth={30} />
                            </g>
                        );
                    })}

                    {CITIES.map(city => {
                        const label = CITY_LABEL_OFFSET[city.labelDir];
                        return (
                            <g key={city.id}>
                                <circle cx={city.x} cy={city.y} r={7} fill="#fdfbf6" stroke="oklch(0.42 0.04 40)" strokeWidth={2.4} />
                                <text
                                    x={city.x + label.dx}
                                    y={city.y + label.dy}
                                    textAnchor={label.anchor}
                                    fontSize={17}
                                    fontWeight={700}
                                    fill="oklch(0.4 0.04 45)"
                                    stroke="oklch(0.96 0.024 85)"
                                    strokeWidth={4.5}
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
