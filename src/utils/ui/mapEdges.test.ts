import { describe, expect, it } from 'vitest';
import { mapEdgeGeometry } from './mapEdges';
import { TERRITORIES, ADJACENCY as WD_ADJACENCY, BOARD_VIEWBOX as WD_VIEWBOX } from '@/games/WorldDomination/board';
import { CITIES, ADJACENCY as OB_ADJACENCY, BOARD_VIEWBOX as OB_VIEWBOX } from '@/games/Outbreak/board';
import { edgeListFrom } from '@/utils/games/adjacencyGraph';

const WIDTH = 800;

describe('mapEdgeGeometry', () => {
    it('draws an ordinary edge as one segment, endpoint to endpoint, with no wrapY', () => {
        const a = { x: 100, y: 40 };
        const b = { x: 180, y: 90 };
        const geom = mapEdgeGeometry(a, b, WIDTH);

        expect(geom.wrapY).toBeUndefined();
        expect(geom.segments).toEqual([{ x1: 100, y1: 40, x2: 180, y2: 90 }]);
    });

    it('draws a wrapping edge as two stubs, each starting at its own node and ending a board-width past the far edge', () => {
        const left = { x: 60, y: 141 };
        const right = { x: 720, y: 141 };
        const geom = mapEdgeGeometry(left, right, WIDTH);

        expect(geom.segments).toHaveLength(2);
        const [leftStub, rightStub] = geom.segments;

        // Left stub leaves its node heading off the left edge (its far end is a
        // ghost of the right node one width to the left, so x2 < 0).
        expect(leftStub.x1).toBe(left.x);
        expect(leftStub.y1).toBe(left.y);
        expect(leftStub.x2).toBe(right.x - WIDTH);
        expect(leftStub.x2).toBeLessThan(0);

        // Right stub mirrors it off the right edge (x2 > width).
        expect(rightStub.x1).toBe(right.x);
        expect(rightStub.y1).toBe(right.y);
        expect(rightStub.x2).toBe(left.x + WIDTH);
        expect(rightStub.x2).toBeGreaterThan(WIDTH);
    });

    it('leaves both halves crossing the map edge at the same y, and reports it as wrapY', () => {
        const left = { x: 80, y: 192 };
        const right = { x: 729, y: 356 };
        const geom = mapEdgeGeometry(left, right, WIDTH);
        const [leftStub, rightStub] = geom.segments;

        // Solve each stub for where it meets its map edge, independently of the
        // helper's own wrapY formula.
        const yAtLeftEdge = crossingY(leftStub, 0);
        const yAtRightEdge = crossingY(rightStub, WIDTH);

        expect(yAtLeftEdge).toBeCloseTo(yAtRightEdge, 9);
        expect(geom.wrapY).toBeCloseTo(yAtLeftEdge, 9);
    });

    it('gives the same result whichever order the nodes are passed', () => {
        const a = { x: 56, y: 38 };
        const b = { x: 710, y: 16 };
        expect(mapEdgeGeometry(a, b, WIDTH)).toEqual(mapEdgeGeometry(b, a, WIDTH));
    });

    it('wraps exactly the four cross-map edges on the real boards and nothing else', () => {
        const wdWraps = wrappingEdgeNames(TERRITORIES, WD_ADJACENCY, WD_VIEWBOX.width);
        const obWraps = wrappingEdgeNames(CITIES, OB_ADJACENCY, OB_VIEWBOX.width);

        expect(wdWraps).toEqual([['Alaska', 'Kamchatka']]);
        expect(obWraps).toEqual([
            ['Los Angeles', 'Sydney'],
            ['Manila', 'San Francisco'],
            ['San Francisco', 'Tokyo'],
        ]);
    });
});

/** Where a segment, extended as a line, crosses the vertical x = edge. */
function crossingY(seg: { x1: number; y1: number; x2: number; y2: number }, edge: number): number {
    const t = (edge - seg.x1) / (seg.x2 - seg.x1);
    return seg.y1 + t * (seg.y2 - seg.y1);
}

/** The name pairs on a board whose edge `mapEdgeGeometry` treats as wrapping,
 *  sorted for a stable comparison. */
function wrappingEdgeNames(
    nodes: { name: string; x: number; y: number }[],
    adjacency: number[][],
    width: number,
): [string, string][] {
    return edgeListFrom(adjacency)
        .filter(([a, b]) => mapEdgeGeometry(nodes[a], nodes[b], width).segments.length === 2)
        .map(([a, b]) => [nodes[a].name, nodes[b].name].sort() as [string, string])
        .sort((p, q) => p[0].localeCompare(q[0]) || p[1].localeCompare(q[1]));
}
