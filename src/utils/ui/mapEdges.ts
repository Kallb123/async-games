// Screen geometry for a board's adjacency lines, shared by every node-and-edge
// map board (World Domination's territories, Outbreak's cities). Most edges are
// a plain line between two node centres, but a handful join two nodes on
// opposite sides of a world map — neighbours "the short way round the globe" —
// and should read as a connection heading off one map edge and re-entering the
// other, not a line slashing across the whole board. This turns one edge into
// the one or two segments that draw it, and pixels stay here rather than in
// `adjacencyGraph.ts`, which knows only graph structure.
import { textRect, type Rect } from "@/utils/ui/mapLabels";

/** Span/width above which an edge is taken to go round the back of the globe.
 *  On today's boards the wrap edges are 79-83% of the width and the longest
 *  genuine edge is 18%, so the exact cut sits in a wide empty gap. */
const WRAP_FRACTION = 0.5;

export interface MapEdgeSegment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface MapEdgeGeometry {
    /** One segment for an ordinary edge; two — the left stub then the right
     *  stub — for a wrapping one. */
    segments: MapEdgeSegment[];
    /** The y at which both halves of a wrapping edge leave the map (where a
     *  wrap label sits); undefined for an ordinary edge. */
    wrapY?: number;
}

interface Point {
    x: number;
    y: number;
}

/**
 * The segment(s) drawing the edge between two nodes on a `width`-wide board.
 *
 * An edge whose horizontal span exceeds half the board width is treated as
 * wrapping round the globe: it becomes two segments, one running from each
 * node towards a *ghost* of the other placed one board-width away, so each
 * stub heads straight off its nearest map edge at the correct angle. Nothing
 * clips them — a root `<svg>` paints only what falls inside its viewBox — so
 * only the on-board part shows. Because the two ghost lines are the same line
 * shifted by exactly one width, both halves cross the map edge at the same y,
 * returned as `wrapY` for the labels.
 *
 * The result is independent of the order the two nodes are passed in.
 */
export function mapEdgeGeometry(a: Point, b: Point, width: number): MapEdgeGeometry {
    if (Math.abs(a.x - b.x) <= width * WRAP_FRACTION) {
        return { segments: [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }] };
    }

    // Left node (smaller x) leaves towards the left edge, right node towards
    // the right edge; sorting here is what makes the result order-independent.
    const [left, right] = a.x <= b.x ? [a, b] : [b, a];
    const wrapY = left.y + (left.x / (left.x + width - right.x)) * (right.y - left.y);

    return {
        segments: [
            { x1: left.x, y1: left.y, x2: right.x - width, y2: right.y },
            { x1: right.x, y1: right.y, x2: left.x + width, y2: left.y },
        ],
        wrapY,
    };
}

/** Font size the wrap stubs' labels draw at, and how far above the stub they sit. */
export const WRAP_LABEL_FONT_SIZE = 6;
const WRAP_LABEL_LIFT = 3;
const WRAP_LABEL_INSET = 3;

export interface MapWrapLabel {
    /** Stable per edge and side: one node can be the far side of several
     *  wrapping edges (San Francisco is Tokyo's and Manila's), so the text
     *  alone does not identify a label. */
    key: string;
    x: number;
    y: number;
    /** Names the node round the other side of the map, with an arrow. */
    text: string;
    textAnchor: 'start' | 'end';
}

/**
 * The pair of labels each wrapping edge needs — one at each map edge its stubs
 * leave through, naming the node on the far side. Position and wording live
 * here rather than in `MapEdges` so a board's label layer can be told to keep
 * its own names off them.
 */
export function wrapEdgeLabels(
    nodes: { name: string; x: number; y: number }[],
    edges: [number, number][],
    width: number,
): MapWrapLabel[] {
    return edges.flatMap(([a, b]) => {
        const { wrapY } = mapEdgeGeometry(nodes[a], nodes[b], width);
        if (wrapY === undefined) return [];
        const [left, right] = nodes[a].x <= nodes[b].x ? [nodes[a], nodes[b]] : [nodes[b], nodes[a]];
        const y = wrapY - WRAP_LABEL_LIFT;
        return [
            { key: `${left.name}-${right.name}-start`, x: WRAP_LABEL_INSET, y, text: `← ${right.name}`, textAnchor: 'start' as const },
            { key: `${left.name}-${right.name}-end`, x: width - WRAP_LABEL_INSET, y, text: `${left.name} →`, textAnchor: 'end' as const },
        ];
    });
}

/** Those labels as obstacle boxes, for a board's `MapLabelLayer`. */
export function wrapEdgeLabelRects(
    nodes: { name: string; x: number; y: number }[],
    edges: [number, number][],
    width: number,
): Rect[] {
    return wrapEdgeLabels(nodes, edges, width)
        .map(label => textRect(label.x, label.y, label.text, WRAP_LABEL_FONT_SIZE, label.textAnchor));
}
