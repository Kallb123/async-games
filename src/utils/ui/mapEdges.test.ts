import { describe, expect, it } from 'vitest';
import { mapEdgeGeometry, wrapEdgeLabels, wrapEdgeLabelRects, WRAP_LABEL_FONT_SIZE } from './mapEdges';
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

describe('wrapEdgeLabels', () => {
    const nodes = [
        { name: 'Alaska', x: 60, y: 100 },
        { name: 'Kamchatka', x: 740, y: 140 },
        { name: 'Peru', x: 200, y: 300 },
    ];

    it('labels only the wrapping edges, one at each map edge', () => {
        const labels = wrapEdgeLabels(nodes, [[0, 1], [0, 2]], WIDTH);
        expect(labels).toHaveLength(2);
        expect(labels.map(l => l.textAnchor)).toEqual(['start', 'end']);
    });

    it('names the node round the other side, with the arrow pointing off its own edge', () => {
        const [left, right] = wrapEdgeLabels(nodes, [[0, 1]], WIDTH);
        // The left-hand stub leaves through x = 0, so it names the node that
        // re-enters on the right, and vice versa.
        expect(left.text).toBe('← Kamchatka');
        expect(left.x).toBeLessThan(WIDTH / 2);
        expect(right.text).toBe('Alaska →');
        expect(right.x).toBeGreaterThan(WIDTH / 2);
    });

    it('reads the same however the edge pair is ordered', () => {
        expect(wrapEdgeLabels(nodes, [[1, 0]], WIDTH)).toEqual(wrapEdgeLabels(nodes, [[0, 1]], WIDTH));
    });

    it('sits both labels at the height the stubs leave the map', () => {
        const { wrapY } = mapEdgeGeometry(nodes[0], nodes[1], WIDTH);
        wrapEdgeLabels(nodes, [[0, 1]], WIDTH).forEach(label => {
            expect(label.y).toBeLessThan(wrapY!);
            expect(wrapY! - label.y).toBeLessThan(WRAP_LABEL_FONT_SIZE);
        });
    });

    it('gives every label on a real board a distinct key, even where one node wraps twice', () => {
        // San Francisco is the near side of two wrapping edges (↔ Tokyo and
        // ↔ Manila), so its wording alone does not identify its label.
        const labels = wrapEdgeLabels(CITIES, edgeListFrom(OB_ADJACENCY), OB_VIEWBOX.width);
        expect(labels.filter(l => l.text === 'San Francisco →').length).toBeGreaterThan(1);
        expect(new Set(labels.map(l => l.key)).size).toBe(labels.length);
    });
});

describe('wrapEdgeLabelRects', () => {
    it('boxes each label where it is drawn, inside the board', () => {
        const nodes = [{ name: 'Alaska', x: 60, y: 100 }, { name: 'Kamchatka', x: 740, y: 140 }];
        const [left, right] = wrapEdgeLabelRects(nodes, [[0, 1]], WIDTH);
        expect(left.x).toBeGreaterThanOrEqual(0);
        expect(right.x + right.width).toBeLessThanOrEqual(WIDTH);
        expect(left.height).toBe(WRAP_LABEL_FONT_SIZE);
    });

    it('gives one box per label on both real boards', () => {
        [[CITIES, OB_ADJACENCY, OB_VIEWBOX.width], [TERRITORIES, WD_ADJACENCY, WD_VIEWBOX.width]].forEach(([nodes, adjacency, width]) => {
            const typedNodes = nodes as { name: string; x: number; y: number }[];
            const edges = edgeListFrom(adjacency as number[][]);
            expect(wrapEdgeLabelRects(typedNodes, edges, width as number))
                .toHaveLength(wrapEdgeLabels(typedNodes, edges, width as number).length);
        });
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
