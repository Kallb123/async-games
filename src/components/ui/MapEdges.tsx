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
}

/**
 * The adjacency layer shared by the node-and-edge map boards (World Domination,
 * Outbreak): a line per edge, except the handful that join nodes on opposite
 * sides of the world map, which draw as two stubs heading off each map edge
 * (see `mapEdgeGeometry`) plus a label at each edge naming the node round the
 * other side. Nodes themselves are still each board's own component — only the
 * lines between them are the same.
 */
export default function MapEdges({ nodes, edges, width, strokeOpacity = 0.5 }: MapEdgesProps) {
    return (
        <>
            <g stroke="#fff" strokeWidth={1} strokeOpacity={strokeOpacity}>
                {edges.flatMap(([a, b]) =>
                    mapEdgeGeometry(nodes[a], nodes[b], width).segments.map((s, i) => (
                        <line key={`${nodes[a].name}-${nodes[b].name}-${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
                    )),
                )}
            </g>

            {wrapEdgeLabels(nodes, edges, width).map(label => (
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
