'use client'
import React from 'react';
import { BOARD_TOPOLOGY, HEX_POSITIONS } from '@/games/SettlementsAndCities/board';
import type { SAC_Resource } from '@/games/SettlementsAndCities/board';
import type { ISACHexResponse, ISACVertexResponse, ISACEdgeResponse, ISACHarborResponse } from '@/games/SettlementsAndCities/apiModels';
import type { SACSpotKind } from '@/games/SettlementsAndCities/ui';
import Dice from '@/components/ui/Dice';

const HEX_SIZE = 52;
const SVG_W = 620;
const SVG_H = 560;
const CX = SVG_W / 2;
const CY = SVG_H / 2;
const R3_2 = Math.sqrt(3) / 2;

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
const TERRAIN_COLORS: Record<string, string> = {
    forest: '#27ae60',
    pasture: '#a8e06c',
    fields: '#f4d03f',
    hills: '#e67e22',
    mountains: '#95a5a6',
    desert: '#f0e4c2',
};
const HARBOR_COLORS: Record<string, string> = {
    '3to1': '#5d6d7e',
    lumber: '#27ae60',
    wool: '#a8e06c',
    grain: '#f4d03f',
    brick: '#e67e22',
    ore: '#95a5a6',
};
const RESOURCE_TYPES: SAC_Resource[] = ['lumber', 'wool', 'grain', 'brick', 'ore'];
const RESOURCE_EMOJI: Record<string, string> = {
    lumber: '🪵', wool: '🐑', grain: '🌾', brick: '🧱', ore: '⛏️',
};

function vertexPx(vertexId: number): [number, number] {
    const { x, y } = BOARD_TOPOLOGY.vertexIntCoords[vertexId];
    return [CX + HEX_SIZE * R3_2 * x, CY + HEX_SIZE / 2 * y];
}

function hexCenterPx(hexId: number): [number, number] {
    const { x, y } = BOARD_TOPOLOGY.hexIntCoords[hexId];
    return [CX + HEX_SIZE * R3_2 * x, CY + HEX_SIZE / 2 * y];
}

interface SettlementsAndCitiesBoardProps {
    hexes: ISACHexResponse[];
    vertices: ISACVertexResponse[];
    edges: ISACEdgeResponse[];
    harbors: ISACHarborResponse[];
    robberHexIndex: number;
    usernameToColor: (username: string | null) => string;
    // Interactive callbacks – undefined when board is view-only
    onVertexClick?: (vertexId: number) => void;
    onEdgeClick?: (edgeId: number) => void;
    onHexClick?: (hexId: number) => void;
    validVertices?: Set<number>;
    validEdges?: Set<number>;
    validHexes?: Set<number>;
    // Chrome shown around the board within the shell
    lastRoll?: number | null;
    lastRollDie1?: number | null;
    lastRollDie2?: number | null;
    /** When set, a translucent prompt is shown over the board (e.g. "Tap to place"). */
    placementPrompt?: string | null;
    /** The spot whose command is in flight: the piece is painted in optimistically
     *  and ringed with marching ants until the server confirms it. */
    pendingSpot?: { kind: SACSpotKind; id: number; colour: string } | null;
}

export default function SettlementsAndCitiesBoard({
    hexes,
    vertices,
    edges,
    harbors,
    robberHexIndex,
    usernameToColor,
    onVertexClick,
    onEdgeClick,
    onHexClick,
    validVertices = new Set(),
    validEdges = new Set(),
    validHexes = new Set(),
    lastRoll = null,
    lastRollDie1 = null,
    lastRollDie2 = null,
    placementPrompt = null,
    pendingSpot = null,
}: SettlementsAndCitiesBoardProps) {
    if (!hexes || hexes.length === 0) return null;

    // Build hex polygon points
    function hexPoints(hexId: number): string {
        return BOARD_TOPOLOGY.hexVertices[hexId]
            .map(vid => vertexPx(vid).join(','))
            .join(' ');
    }

    const pendingAt = (kind: SACSpotKind, id: number) =>
        pendingSpot?.kind === kind && pendingSpot.id === id;

    return (
        <>
            <div className="ag-board-frame">
                {lastRoll !== null && (
                    <div className="ag-board-tag ag-board-tag--dice">
                        {lastRollDie1 !== null && lastRollDie2 !== null && (
                            <Dice values={[lastRollDie1, lastRollDie2]} size={22} />
                        )}
                        <span>Last roll: {lastRoll}</span>
                    </div>
                )}
                {placementPrompt && (
                    <div className="ag-board-overlay"><div>{placementPrompt}</div></div>
                )}
                <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width={SVG_W} height={SVG_H}>
                {/* ── Hex tiles ── */}
                {hexes.map((hex, hexId) => {
                const [cx, cy] = hexCenterPx(hexId);
                const isRobber = hexId === robberHexIndex;
                const isValid = validHexes.has(hexId);
                const isPending = pendingAt('hex', hexId);
                return (
                    <g key={hexId}>
                        <polygon
                            points={hexPoints(hexId)}
                            fill={TERRAIN_COLORS[hex.terrain] ?? '#ccc'}
                            stroke={isValid ? '#ffe000' : '#fff'}
                            strokeWidth={isValid ? 3 : 1}
                            style={{ cursor: isValid && onHexClick ? 'pointer' : 'default' }}
                            onClick={() => isValid && onHexClick && onHexClick(hexId)}
                        />
                        {isPending && (
                            <>
                                <polygon className="ag-svg-ants" points={hexPoints(hexId)} style={{ pointerEvents: 'none' }} />
                                <text className="ag-svg-ghost" x={cx} y={cy - 16} textAnchor="middle" fontSize={20} style={{ pointerEvents: 'none' }}>🏴‍☠️</text>
                            </>
                        )}
                        {hex.numberToken !== null && (
                            <>
                                <circle
                                    cx={cx}
                                    cy={cy}
                                    r={14}
                                    fill={hex.numberToken === 6 || hex.numberToken === 8 ? '#ffd5d5' : '#fffde7'}
                                    stroke="#ccc"
                                    strokeWidth={1}
                                    style={{ pointerEvents: 'none' }}
                                />
                                <text
                                    x={cx}
                                    y={cy + 5}
                                    textAnchor="middle"
                                    fontSize={13}
                                    fontWeight="bold"
                                    fill={hex.numberToken === 6 || hex.numberToken === 8 ? '#c0392b' : '#333'}
                                    style={{ pointerEvents: 'none' }}
                                >
                                    {hex.numberToken}
                                </text>
                            </>
                        )}
                        {isRobber && (
                            <text x={cx} y={cy - 16} textAnchor="middle" fontSize={20} style={{ pointerEvents: 'none' }}>🏴‍☠️</text>
                        )}
                    </g>
                );
            })}

            {/* ── Harbors ── */}
            {harbors.map((harbor, i) => {
                const [v1, v2] = harbor.vertices;
                const [x1, y1] = vertexPx(v1);
                const [x2, y2] = vertexPx(v2);
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                const label = harbor.type === '3to1' ? '3:1' : `2:1 ${RESOURCE_EMOJI[harbor.type] ?? harbor.type}`;
                return (
                    <g key={i} style={{ pointerEvents: 'none' }}>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={HARBOR_COLORS[harbor.type]} strokeWidth={4} strokeDasharray="4 2" />
                        <text x={mx} y={my - 6} textAnchor="middle" fontSize={9} fill={HARBOR_COLORS[harbor.type]} fontWeight="bold">
                            {label}
                        </text>
                    </g>
                );
            })}

            {/* ── Roads (edges) ── */}
            {edges.map((edge, edgeId) => {
                const [v1, v2] = BOARD_TOPOLOGY.edges[edgeId];
                const [x1, y1] = vertexPx(v1);
                const [x2, y2] = vertexPx(v2);
                const isValid = validEdges.has(edgeId);
                const isPending = pendingAt('edge', edgeId);
                if (!edge.hasRoad && !isValid && !isPending) return null;
                const clickable = isValid && !!onEdgeClick;
                // A pending road is painted in already, in our own colour — the
                // ants around it are what say "not confirmed yet".
                const ghost = isPending && !edge.hasRoad;
                return (
                    <g key={edgeId}>
                        <line
                            className={ghost ? 'ag-svg-ghost' : undefined}
                            x1={x1} y1={y1} x2={x2} y2={y2}
                            stroke={ghost ? pendingSpot!.colour : (edge.hasRoad ? usernameToColor(edge.owner) : '#ffe000')}
                            strokeWidth={edge.hasRoad || ghost ? 6 : 7}
                            strokeLinecap="round"
                            strokeOpacity={isValid && !edge.hasRoad && !ghost ? 0.75 : 1}
                            style={{ pointerEvents: 'none' }}
                        />
                        {isPending && (
                            <line
                                className="ag-svg-ants"
                                x1={x1} y1={y1} x2={x2} y2={y2}
                                strokeWidth={9}
                                style={{ pointerEvents: 'none' }}
                            />
                        )}
                        {clickable && (
                            // Fat transparent hit area so roads are easy to tap.
                            <line
                                x1={x1} y1={y1} x2={x2} y2={y2}
                                stroke="transparent"
                                strokeWidth={22}
                                strokeLinecap="round"
                                style={{ cursor: 'pointer' }}
                                onClick={() => onEdgeClick && onEdgeClick(edgeId)}
                            />
                        )}
                    </g>
                );
            })}

            {/* ── Settlements and Cities ── */}
            {vertices.map((vertex, vertexId) => {
                const [vx, vy] = vertexPx(vertexId);
                const isValid = validVertices.has(vertexId);
                const isPending = pendingAt('vertex', vertexId);

                if (!vertex.building && !isValid && !isPending) return null;

                const clickable = isValid && !!onVertexClick;
                const parts: React.ReactNode[] = [];

                // The piece the command will produce, painted in before the server
                // confirms it: a settlement on an empty spot, a city on our own.
                if (isPending && !vertex.building) {
                    parts.push(
                        <rect
                            key="ghost"
                            className="ag-svg-ghost"
                            x={vx - 7} y={vy - 7}
                            width={14} height={14}
                            fill={pendingSpot!.colour}
                            stroke="#fff"
                            strokeWidth={1.5}
                            rx={2}
                            style={{ pointerEvents: 'none' }}
                        />
                    );
                } else if (isPending && vertex.building === 'settlement') {
                    parts.push(
                        <rect
                            key="ghost"
                            className="ag-svg-ghost"
                            x={vx - 5} y={vy - 14}
                            width={10} height={8}
                            fill={pendingSpot!.colour}
                            stroke="#fff"
                            strokeWidth={1}
                            rx={1}
                            style={{ pointerEvents: 'none' }}
                        />
                    );
                }

                // Building visual (never intercepts clicks — the hit circle handles it).
                if (vertex.building === 'settlement') {
                    parts.push(
                        <rect
                            key="b"
                            x={vx - 7} y={vy - 7}
                            width={14} height={14}
                            fill={usernameToColor(vertex.owner)}
                            stroke="#fff"
                            strokeWidth={1.5}
                            rx={2}
                            style={{ pointerEvents: 'none' }}
                        />
                    );
                } else if (vertex.building === 'city') {
                    parts.push(
                        <g key="b" style={{ pointerEvents: 'none' }}>
                            <rect x={vx - 9} y={vy - 9} width={18} height={18} fill={usernameToColor(vertex.owner)} stroke="#fff" strokeWidth={1.5} rx={3} />
                            <rect x={vx - 5} y={vy - 14} width={10} height={8} fill={usernameToColor(vertex.owner)} stroke="#fff" strokeWidth={1} rx={1} />
                        </g>
                    );
                }

                if (isPending) {
                    parts.push(
                        <circle
                            key="ants"
                            className="ag-svg-ants"
                            cx={vx} cy={vy}
                            r={13}
                            style={{ pointerEvents: 'none' }}
                        />
                    );
                }

                // Valid highlight ring — a filled dot on empty spots, an outline
                // around an existing settlement being upgraded to a city.
                if (isValid) {
                    parts.push(
                        <circle
                            key="hi"
                            cx={vx} cy={vy}
                            r={vertex.building ? 13 : 11}
                            fill={vertex.building ? 'none' : '#ffe000'}
                            fillOpacity={0.7}
                            stroke="#e67e22"
                            strokeWidth={2.5}
                            style={{ pointerEvents: 'none' }}
                        />
                    );
                }

                // Fat transparent hit circle so nodes are easy to tap.
                if (clickable) {
                    parts.push(
                        <circle
                            key="hit"
                            cx={vx} cy={vy}
                            r={16}
                            fill="transparent"
                            style={{ cursor: 'pointer' }}
                            onClick={() => onVertexClick && onVertexClick(vertexId)}
                        />
                    );
                }

                return <g key={vertexId}>{parts}</g>;
            })}
                </svg>
            </div>
            <div className="ag-reslegend">
                {RESOURCE_TYPES.map((resource) => (
                    <div key={resource} className="ag-reslegend-pill">
                        <span className="ag-reslegend-dot" style={{ background: HARBOR_COLORS[resource] }} />
                        <span>{RESOURCE_EMOJI[resource]} {resource}</span>
                    </div>
                ))}
            </div>
        </>
    );
}
