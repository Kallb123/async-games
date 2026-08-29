'use client'
import React from 'react';
import MapLabel from '@/components/ui/MapLabel';
import { mapEdgeGeometry } from '@/utils/ui/mapEdges';

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

const LABEL_FONT_SIZE = 6;

/**
 * The adjacency layer shared by the node-and-edge map boards (World Domination,
 * Outbreak): a line per edge, except the handful that join nodes on opposite
 * sides of the world map, which draw as two stubs heading off each map edge
 * (see `mapEdgeGeometry`) plus a label at each edge naming the node round the
 * other side. Nodes themselves are still each board's own component — only the
 * lines between them are the same.
 */
export default function MapEdges({ nodes, edges, width, strokeOpacity = 0.5 }: MapEdgesProps) {
    const drawn = edges.map(([a, b]) => ({ a: nodes[a], b: nodes[b], geom: mapEdgeGeometry(nodes[a], nodes[b], width) }));

    return (
        <>
            <g stroke="#fff" strokeWidth={1} strokeOpacity={strokeOpacity}>
                {drawn.flatMap(({ a, b, geom }) =>
                    geom.segments.map((s, i) => (
                        <line key={`${a.name}-${b.name}-${i}`} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
                    )),
                )}
            </g>

            {/* A wrapping edge's two stubs each get a label at the edge they
                leave, naming the node round the other side of the map. */}
            {drawn.map(({ a, b, geom }) => {
                if (geom.wrapY === undefined) return null;
                const [left, right] = a.x <= b.x ? [a, b] : [b, a];
                const y = geom.wrapY - 3;
                return (
                    <React.Fragment key={`wrap-${left.name}-${right.name}`}>
                        <MapLabel x={3} y={y} textAnchor="start" fontSize={LABEL_FONT_SIZE} fontWeight={700}>
                            ← {right.name}
                        </MapLabel>
                        <MapLabel x={width - 3} y={y} textAnchor="end" fontSize={LABEL_FONT_SIZE} fontWeight={700}>
                            {left.name} →
                        </MapLabel>
                    </React.Fragment>
                );
            })}
        </>
    );
}
