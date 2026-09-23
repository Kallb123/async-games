'use client'
import React from 'react';
import MapLabel from '@/components/ui/MapLabel';
import { mapEdgeGeometry, wrapEdgeLabels, WRAP_LABEL_FONT_SIZE } from '@/utils/ui/mapEdges';

interface MapEdgesProps {
    /** Board nodes in id order — only their name and position is used. */
    nodes: { name: string; x: number; y: number }[];
    /** Deduped adjacency pairs, from `edgeListFrom`. */
    edges: [number, number][];
    /** The board viewBox width the map wraps at. */
    width: number;
    /** Default 0.5; Outbreak's busier map passes 0.35. */
    strokeOpacity?: number;
    /**
     * The points an edge bends through between its two nodes, indexed like
     * `edges`. An edge given some draws as a polyline along them — a route that
     * follows the ground (Kingdom Builder's tile paths) rather than a straight
     * line — and never wraps.
     */
    waypoints?: ReadonlyArray<ReadonlyArray<{ x: number; y: number }> | undefined>;
}

/**
 * The adjacency layer shared by the node-and-edge map boards (World Domination,
 * Outbreak, Kingdom Builder): a line per edge — or a polyline, for an edge
 * given `waypoints` — except the handful that join nodes on opposite
 * sides of the world map, which draw as two stubs heading off each map edge
 * (see `mapEdgeGeometry`) plus a label at each edge naming the node round the
 * other side. Nodes themselves are still each board's own component — only the
 * lines between them are the same.
 */
export default function MapEdges({ nodes, edges, width, strokeOpacity = 0.5, waypoints }: MapEdgesProps) {
    const straight = waypoints ? edges.filter((_, index) => !waypoints[index]) : edges;
    return (
        <>
            <g stroke="#fff" strokeWidth={1} strokeOpacity={strokeOpacity} fill="none" strokeLinejoin="round">
                {edges.flatMap(([a, b], index) => {
                    const bends = waypoints?.[index];
                    if (bends) {
                        const points = [nodes[a], ...bends, nodes[b]].map(point => `${point.x},${point.y}`).join(" ");
                        return [<polyline key={`${nodes[a].name}-${nodes[b].name}`} points={points} />];
                    }
                    return mapEdgeGeometry(nodes[a], nodes[b], width).segments.map((s, i) => (
                        <line key={`${nodes[a].name}-${nodes[b].name}-${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
                    ));
                })}
            </g>

            {wrapEdgeLabels(nodes, straight, width).map(label => (
                <MapLabel
                    key={label.key}
                    x={label.x} y={label.y} textAnchor={label.textAnchor}
                    fontSize={WRAP_LABEL_FONT_SIZE} fontWeight={700}
                >
                    {label.text}
                </MapLabel>
            ))}
        </>
    );
}
