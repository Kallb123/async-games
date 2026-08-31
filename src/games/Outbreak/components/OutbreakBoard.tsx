'use client'
import React from 'react';
import BoardZoom from '@/components/ui/BoardZoom';
import ClickableMapNode from '@/components/ui/ClickableMapNode';
import MapEdges from '@/components/ui/MapEdges';
import MapLabelLayer from '@/components/ui/MapLabelLayer';
import type { IOutbreakPlayerStateResponse, IOutbreakCityResponse } from '@/games/Outbreak/apiModels';
import { ADJACENCY, BOARD_VIEWBOX, CITIES, DISEASE_COLORS, DISEASE_COLOR_DEFS } from '@/games/Outbreak/board';
import { edgeListFrom } from '@/utils/games/adjacencyGraph';
import { wrapEdgeLabelRects } from '@/utils/ui/mapEdges';
import { type Rect } from '@/utils/ui/mapLabels';
import { playerColourForId } from '@/utils/ui/playerColours';

const EDGE_LIST = edgeListFrom(ADJACENCY);
const NODE_RADIUS = 7;
const LABEL_FONT_SIZE = 6;
const LABEL_OFFSET = NODE_RADIUS + 4;

// The markers crowding a node: a research station and the pawns standing in the
// city sit above it, the disease-cube chips below. Their boxes are worked out
// once per city and used twice — to draw them, and to tell the label layer what
// it has to keep the 48 city names off.
const STATION_SIZE = 8;
const CUBE_SIZE = 8;
const CUBE_PITCH = CUBE_SIZE + 1;
const PAWN_RADIUS = 3;

function stationRect(x: number, y: number): Rect {
    return { x: x + 2, y: y - NODE_RADIUS - 7, width: STATION_SIZE, height: STATION_SIZE };
}

function pawnRect(x: number, y: number, count: number): Rect {
    const diameter = PAWN_RADIUS * 2;
    return { x: x - (count * diameter) / 2, y: y - NODE_RADIUS - 4 - PAWN_RADIUS, width: count * diameter, height: diameter };
}

function cubeRect(x: number, y: number, count: number): Rect {
    return {
        x: x - (count * CUBE_PITCH) / 2,
        y: y + NODE_RADIUS + 3,
        width: count * CUBE_PITCH - (CUBE_PITCH - CUBE_SIZE),
        height: CUBE_SIZE,
    };
}

// The wrapping edges' own labels sit at the map edges and never move, so their
// boxes are fixed too — the city names have to dodge them all the same.
const WRAP_LABEL_RECTS = wrapEdgeLabelRects(CITIES, EDGE_LIST, BOARD_VIEWBOX.width);

interface OutbreakBoardProps {
    cities: IOutbreakCityResponse[];
    playerStates: { [userId: string]: IOutbreakPlayerStateResponse };
    /** Player seats in turn order (userIds) — pawn colour is a player's index here. */
    userIdList: string[];
    /** Cities the pending move (if any) can legally land on — the tappable ones. */
    validCities: Set<number>;
    onCityClick?: (cityId: number) => void;
    boardTag?: string | null;
    /** The city named by a tapped hand/discard card, ringed for reference only. */
    highlightedCityId?: number | null;
}

/**
 * The Outbreak world map: 48 cities over the map art, joined by the printed
 * travel routes. Unlike WorldDominationBoard's single owner-coloured circle
 * per node, a city here carries four independent layers of state at once —
 * its home region colour, up to four disease-cube stacks, a research station,
 * and whichever players are standing in it — so the node renderer stays its
 * own component rather than a shared one wearing different data (see
 * docs/games/outbreak-gdd.md §21.6 step 5).
 */
export default function OutbreakBoard({ cities, playerStates, userIdList, validCities, onCityClick, boardTag = null, highlightedCityId = null }: OutbreakBoardProps) {
    const pawnsByCity = new Map<number, string[]>();
    userIdList.forEach(userId => {
        const cityId = playerStates[userId]?.city;
        if (cityId === undefined) return;
        pawnsByCity.set(cityId, [...(pawnsByCity.get(cityId) ?? []), userId]);
    });

    const drawn = CITIES.flatMap(def => {
        const state = cities[def.id];
        if (!state) return [];
        const cubeColors = DISEASE_COLORS.filter(c => state.cubes[c] > 0);
        const pawns = pawnsByCity.get(def.id) ?? [];
        return [{
            def, state, cubeColors, pawns,
            station: state.station ? stationRect(def.x, def.y) : null,
            pawnRow: pawns.length > 0 ? pawnRect(def.x, def.y, pawns.length) : null,
            cubes: cubeColors.length > 0 ? cubeRect(def.x, def.y, cubeColors.length) : null,
        }];
    });

    const markers: Rect[] = [
        ...WRAP_LABEL_RECTS,
        ...drawn.flatMap(city => [city.station, city.pawnRow, city.cubes].filter((rect): rect is Rect => rect !== null)),
    ];

    return (
        <div className="ag-board-frame ag-outbreak-frame">
            {boardTag && <div className="ag-board-tag">{boardTag}</div>}
            <BoardZoom zoomWidth="220%">
                <svg viewBox={`0 0 ${BOARD_VIEWBOX.width} ${BOARD_VIEWBOX.height}`}>
                    <image
                        href="/art/outbreak/board.png"
                        x={0} y={0} width={BOARD_VIEWBOX.width} height={BOARD_VIEWBOX.height}
                        preserveAspectRatio="xMidYMid slice"
                    />

                    {/* Adjacency lines — the map art's own printed routes are
                        decorative reference only (and, in places, wrong: see
                        the commit notes), so gameplay draws its own. Cross-map
                        edges (San Francisco ↔ Tokyo, etc.) wrap round the globe. */}
                    <MapEdges nodes={CITIES} edges={EDGE_LIST} width={BOARD_VIEWBOX.width} strokeOpacity={0.35} />

                    {drawn.map(({ def, state, cubeColors, pawns, station, pawnRow, cubes }) => {
                        const isHighlighted = def.id === highlightedCityId;
                        const colorHex = DISEASE_COLOR_DEFS[def.color].hex;

                        return (
                            <ClickableMapNode
                                key={def.id}
                                x={def.x} y={def.y} radius={NODE_RADIUS}
                                isValid={validCities.has(def.id)}
                                isHighlighted={isHighlighted}
                                onClick={onCityClick && (() => onCityClick(def.id))}
                                title={<>
                                    {def.name} — {DISEASE_COLOR_DEFS[def.color].name}
                                    {state.station ? ' · research station' : ''}
                                    {cubeColors.map(c => ` · ${state.cubes[c]} ${c}`).join('')}
                                </>}
                            >
                                <circle
                                    cx={def.x} cy={def.y} r={NODE_RADIUS} fill={colorHex} stroke="#fff" strokeWidth={1.3}
                                    className={isHighlighted ? 'ag-map-node-pulse' : undefined}
                                />

                                {station && (
                                    <rect
                                        x={station.x} y={station.y} width={station.width} height={station.height} rx={1.5}
                                        fill="#fff" stroke={colorHex} strokeWidth={1.3}
                                    />
                                )}

                                {cubes && cubeColors.map((color, i) => (
                                    <g key={color} transform={`translate(${cubes.x + i * CUBE_PITCH}, ${cubes.y})`}>
                                        <rect width={CUBE_SIZE} height={CUBE_SIZE} rx={1.5} fill={DISEASE_COLOR_DEFS[color].hex} stroke="#fff" strokeWidth={0.8} />
                                        <text x={CUBE_SIZE / 2} y={CUBE_SIZE - 1.5} textAnchor="middle" fontSize={6.5} fontWeight={800} fill="#fff">
                                            {state.cubes[color]}
                                        </text>
                                    </g>
                                ))}

                                {pawnRow && pawns.map((userId, i) => (
                                    <circle
                                        key={userId}
                                        cx={pawnRow.x + i * PAWN_RADIUS * 2 + PAWN_RADIUS}
                                        cy={pawnRow.y + PAWN_RADIUS}
                                        r={PAWN_RADIUS}
                                        fill={playerColourForId(userId, userIdList)}
                                        stroke="#fff"
                                        strokeWidth={1}
                                    />
                                ))}
                            </ClickableMapNode>
                        );
                    })}

                    {/* City names last, so a name reads over its neighbours'
                        cubes and pawns rather than under them. */}
                    <MapLabelLayer
                        labels={drawn.map(({ def }) => ({ key: def.id, x: def.x, y: def.y, text: def.name, dir: def.labelDir, radius: NODE_RADIUS }))}
                        obstacles={markers}
                        width={BOARD_VIEWBOX.width} height={BOARD_VIEWBOX.height}
                        offset={LABEL_OFFSET}
                        fontSize={LABEL_FONT_SIZE} fontWeight={700}
                    />
                </svg>
            </BoardZoom>
        </div>
    );
}
