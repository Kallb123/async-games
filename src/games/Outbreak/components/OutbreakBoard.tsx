'use client'
import React from 'react';
import BoardZoom from '@/components/ui/BoardZoom';
import ClickableMapNode from '@/components/ui/ClickableMapNode';
import MapEdges from '@/components/ui/MapEdges';
import MapLabel from '@/components/ui/MapLabel';
import type { IOutbreakPlayerStateResponse, IOutbreakCityResponse } from '@/games/Outbreak/apiModels';
import { ADJACENCY, BOARD_VIEWBOX, CITIES, CITY_LABEL_OFFSET, DISEASE_COLORS, DISEASE_COLOR_DEFS } from '@/games/Outbreak/board';
import { edgeListFrom } from '@/utils/games/adjacencyGraph';
import { playerColourForId } from '@/utils/ui/playerColours';

const EDGE_LIST = edgeListFrom(ADJACENCY);
const NODE_RADIUS = 7;

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

                    {CITIES.map(def => {
                        const state = cities[def.id];
                        if (!state) return null;
                        const isValid = validCities.has(def.id);
                        const isHighlighted = def.id === highlightedCityId;
                        const colorHex = DISEASE_COLOR_DEFS[def.color].hex;
                        const cubeColors = DISEASE_COLORS.filter(c => state.cubes[c] > 0);
                        const pawns = pawnsByCity.get(def.id) ?? [];

                        return (
                            <ClickableMapNode
                                key={def.id}
                                x={def.x} y={def.y} radius={NODE_RADIUS}
                                isValid={isValid}
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

                                {(() => {
                                    const label = CITY_LABEL_OFFSET[def.labelDir];
                                    return (
                                        <MapLabel
                                            x={def.x + label.dx} y={def.y + label.dy}
                                            textAnchor={label.anchor}
                                            fontSize={6} fontWeight={700}
                                        >
                                            {def.name}
                                        </MapLabel>
                                    );
                                })()}

                                {state.station && (
                                    <rect
                                        x={def.x + 2} y={def.y - NODE_RADIUS - 7}
                                        width={8} height={8} rx={1.5}
                                        fill="#fff" stroke={colorHex} strokeWidth={1.3}
                                    />
                                )}

                                {cubeColors.length > 0 && (() => {
                                    const w = 8;
                                    const startX = def.x - (cubeColors.length * (w + 1)) / 2;
                                    return (
                                        <g>
                                            {cubeColors.map((color, i) => (
                                                <g key={color} transform={`translate(${startX + i * (w + 1)}, ${def.y + NODE_RADIUS + 3})`}>
                                                    <rect width={w} height={w} rx={1.5} fill={DISEASE_COLOR_DEFS[color].hex} stroke="#fff" strokeWidth={0.8} />
                                                    <text x={w / 2} y={w - 1.5} textAnchor="middle" fontSize={6.5} fontWeight={800} fill="#fff">
                                                        {state.cubes[color]}
                                                    </text>
                                                </g>
                                            ))}
                                        </g>
                                    );
                                })()}

                                {pawns.length > 0 && (() => {
                                    const d = 6;
                                    const startX = def.x - (pawns.length * d) / 2;
                                    return (
                                        <g>
                                            {pawns.map((userId, i) => (
                                                <circle
                                                    key={userId}
                                                    cx={startX + i * d + d / 2}
                                                    cy={def.y - NODE_RADIUS - 4}
                                                    r={3}
                                                    fill={playerColourForId(userId, userIdList)}
                                                    stroke="#fff"
                                                    strokeWidth={1}
                                                />
                                            ))}
                                        </g>
                                    );
                                })()}
                            </ClickableMapNode>
                        );
                    })}
                </svg>
            </BoardZoom>
        </div>
    );
}
