'use client'
import React from 'react';
import BoardZoom from '@/components/ui/BoardZoom';
import MapLabelLayer from '@/components/ui/MapLabelLayer';
import { BOARD_VIEWBOX, CITIES, ROUTES, routeName } from '@/games/TrainTime/board';
import { ROUTE_GEOMETRY, TRACK_PALETTE } from '@/games/TrainTime/ui';

interface TrainTimeBoardProps {
    /** Owning player's stable userId per route id, null where unclaimed. */
    routeOwners: (string | null)[];
    /** owner userId → colour / display name. */
    colourForOwner: (owner: string) => string;
    nameForOwner: (owner: string) => string;
    /** Routes the current player could claim right now — the tappable ones. */
    claimableRoutes: Set<number>;
    /** Light up those routes and step everything else back, while the player
     *  is actually choosing one. */
    highlightClaimable?: boolean;
    selectedRouteId: number | null;
    /** City ids to ring — the two ends of whichever ticket is being looked at. */
    highlightedCities?: Set<number>;
    onRouteClick?: (routeId: number) => void;
    /** Short status pill in the corner of the map. */
    boardTag?: string | null;
}

// Sized for the 1240-wide board viewBox, so the printed track reads as chunky
// dashes at the width the app column actually renders it.
const TRACK_WIDTH = 10;
const CLAIMED_TRACK_WIDTH = 13;

const CITY_RADIUS = 7;
const TICKET_CITY_RADIUS = 9;
const TICKET_HALO_RADIUS = 18;
const LABEL_OFFSET = 14;
const LABEL_FONT_SIZE = 17;
const TICKET_LABEL_FONT_SIZE = 19;

/**
 * The Train Time map, drawn as a printed rail chart on parchment: 36 cities
 * joined by 100 runs of dashed track, one dash per train space, inked in the
 * route's card colour until somebody claims it and it turns their own. The
 * map is wider than the app column, so it zooms and scrolls rather than
 * shrinking the tap targets to nothing.
 */
export default function TrainTimeBoard({
    routeOwners,
    colourForOwner,
    nameForOwner,
    claimableRoutes,
    highlightClaimable = false,
    selectedRouteId,
    highlightedCities,
    onRouteClick,
    boardTag = null,
}: TrainTimeBoardProps) {
    // A ticket end draws bigger and bolder, so work it out once for the dot and
    // its name rather than asking the same question in both loops.
    const drawn = CITIES.map(city => ({ city, onTicket: !!highlightedCities?.has(city.id) }));

    return (
        <div className="ag-board-frame ag-tt-frame">
            {boardTag && <div className="ag-board-tag">{boardTag}</div>}
            <BoardZoom zoomWidth="260%">
                <svg viewBox={`0 0 ${BOARD_VIEWBOX.width} ${BOARD_VIEWBOX.height}`}>
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
                                <title>{routeName(route)} — {route.length} × {route.colour}{owner ? ` · ${nameForOwner(owner)}` : ''}</title>
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
                                    stroke={owner ? colourForOwner(owner) : TRACK_PALETTE[route.colour].fill}
                                    strokeWidth={owner ? CLAIMED_TRACK_WIDTH : TRACK_WIDTH}
                                    strokeDasharray={dashArray}
                                    strokeOpacity={owner || claimable ? 1 : highlightClaimable ? 0.28 : 0.75}
                                />
                                {/* Fat invisible tap target, so a 1-space route is still hittable. */}
                                <path d={trackPath} fill="none" stroke="transparent" strokeWidth={30} />
                            </g>
                        );
                    })}

                    {drawn.map(({ city, onTicket }) => (
                        <React.Fragment key={city.id}>
                            {onTicket && (
                                <circle
                                    cx={city.x}
                                    cy={city.y}
                                    r={TICKET_HALO_RADIUS}
                                    fill="var(--tt-brass)"
                                    fillOpacity={0.3}
                                    stroke="var(--tt-brass)"
                                    strokeWidth={3}
                                />
                            )}
                            <circle
                                cx={city.x}
                                cy={city.y}
                                r={onTicket ? TICKET_CITY_RADIUS : CITY_RADIUS}
                                fill={onTicket ? 'var(--tt-brass)' : '#fdfbf6'}
                                stroke="oklch(0.42 0.04 40)"
                                strokeWidth={2.4}
                            />
                        </React.Fragment>
                    ))}

                    {/* City names last, laid out together so that none of the 36
                        lands on another name, on a station dot, or off the map —
                        a ticket end's name is pulled forward as it always was.
                        The brass ticket halo is deliberately not fenced off: it
                        is translucent, and a name has always read across it. */}
                    <MapLabelLayer
                        labels={drawn.map(({ city, onTicket }) => ({
                            key: city.id,
                            x: city.x, y: city.y,
                            text: city.name,
                            dir: city.labelDir,
                            radius: TICKET_CITY_RADIUS,
                            fontSize: onTicket ? TICKET_LABEL_FONT_SIZE : LABEL_FONT_SIZE,
                            fontWeight: onTicket ? 800 : 700,
                            fill: onTicket ? 'var(--tt-ink)' : 'oklch(0.4 0.04 45)',
                        }))}
                        width={BOARD_VIEWBOX.width} height={BOARD_VIEWBOX.height}
                        offset={LABEL_OFFSET}
                        stroke="oklch(0.96 0.024 85)"
                        strokeWidth={4.5}
                        strokeLinejoin="round"
                    />
                </svg>
            </BoardZoom>
        </div>
    );
}
