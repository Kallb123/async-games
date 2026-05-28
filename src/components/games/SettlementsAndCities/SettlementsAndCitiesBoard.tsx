'use client'
import React from 'react';
import { BOARD_TOPOLOGY, HEX_POSITIONS } from '@/games/SettlementsAndCities/board';
import type { ISACHexResponse, ISACVertexResponse, ISACEdgeResponse, ISACHarborResponse } from '@/games/SettlementsAndCities/apiModels';

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
}: SettlementsAndCitiesBoardProps) {
    if (!hexes || hexes.length === 0) return null;

    // Build hex polygon points
    function hexPoints(hexId: number): string {
        return BOARD_TOPOLOGY.hexVertices[hexId]
            .map(vid => vertexPx(vid).join(','))
            .join(' ');
    }

    return (
        <svg
            width={SVG_W}
            height={SVG_H}
            style={{ display: 'block', margin: '0 auto', background: '#85c1e9' }}
        >
            {/* ── Hex tiles ── */}
            {hexes.map((hex, hexId) => {
                const [cx, cy] = hexCenterPx(hexId);
                const isRobber = hexId === robberHexIndex;
                const isValid = validHexes.has(hexId);
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
                        {hex.numberToken !== null && (
                            <>
                                <circle
                                    cx={cx}
                                    cy={cy}
                                    r={14}
                                    fill={hex.numberToken === 6 || hex.numberToken === 8 ? '#ffd5d5' : '#fffde7'}
                                    stroke="#ccc"
                                    strokeWidth={1}
                                />
                                <text
                                    x={cx}
                                    y={cy + 5}
                                    textAnchor="middle"
                                    fontSize={13}
                                    fontWeight="bold"
                                    fill={hex.numberToken === 6 || hex.numberToken === 8 ? '#c0392b' : '#333'}
                                >
                                    {hex.numberToken}
                                </text>
                            </>
                        )}
                        {isRobber && (
                            <text x={cx} y={cy - 16} textAnchor="middle" fontSize={20}>🏴‍☠️</text>
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
                    <g key={i}>
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
                if (!edge.hasRoad && !isValid) return null;
                return (
                    <line
                        key={edgeId}
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={edge.hasRoad ? usernameToColor(edge.owner) : '#ffe000'}
                        strokeWidth={edge.hasRoad ? 6 : 4}
                        strokeLinecap="round"
                        strokeOpacity={isValid && !edge.hasRoad ? 0.6 : 1}
                        style={{ cursor: isValid && onEdgeClick ? 'pointer' : 'default' }}
                        onClick={() => isValid && onEdgeClick && onEdgeClick(edgeId)}
                    />
                );
            })}

            {/* ── Settlements and Cities ── */}
            {vertices.map((vertex, vertexId) => {
                const [vx, vy] = vertexPx(vertexId);
                const isValid = validVertices.has(vertexId);

                if (!vertex.building && !isValid) return null;

                if (vertex.building === 'settlement') {
                    return (
                        <rect
                            key={vertexId}
                            x={vx - 7} y={vy - 7}
                            width={14} height={14}
                            fill={usernameToColor(vertex.owner)}
                            stroke="#fff"
                            strokeWidth={1.5}
                            rx={2}
                        />
                    );
                }
                if (vertex.building === 'city') {
                    return (
                        <g key={vertexId}>
                            <rect x={vx - 9} y={vy - 9} width={18} height={18} fill={usernameToColor(vertex.owner)} stroke="#fff" strokeWidth={1.5} rx={3} />
                            <rect x={vx - 5} y={vy - 14} width={10} height={8} fill={usernameToColor(vertex.owner)} stroke="#fff" strokeWidth={1} rx={1} />
                        </g>
                    );
                }

                // Valid placement indicator
                return (
                    <circle
                        key={vertexId}
                        cx={vx} cy={vy}
                        r={8}
                        fill="#ffe000"
                        fillOpacity={0.7}
                        stroke="#e67e22"
                        strokeWidth={1.5}
                        style={{ cursor: 'pointer' }}
                        onClick={() => onVertexClick && onVertexClick(vertexId)}
                    />
                );
            })}
        </svg>
    );
}
