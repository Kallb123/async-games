import { describe, expect, it } from 'vitest';
import { circleRect, estimateTextWidth, resolveMapLabels, textRect, type MapLabelDir, type MapLabelRequest, type Rect } from './mapLabels';
import { CITIES as OUTBREAK_CITIES, BOARD_VIEWBOX as OUTBREAK_VIEWBOX } from '@/games/Outbreak/board';
import { CITIES as TRAIN_CITIES, BOARD_VIEWBOX as TRAIN_VIEWBOX } from '@/games/TrainTime/board';

const BOUNDS: Rect = { x: 0, y: 0, width: 800, height: 460 };

function label(over: Partial<MapLabelRequest> = {}): MapLabelRequest {
    return { x: 400, y: 230, text: 'Istanbul', fontSize: 6, offset: 11, dir: 'n', ...over };
}

function overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('estimateTextWidth', () => {
    it('grows with the text and the font size', () => {
        expect(estimateTextWidth('Rio', 10)).toBeLessThan(estimateTextWidth('Rio de Janeiro', 10));
        expect(estimateTextWidth('Rio', 10)).toBeLessThan(estimateTextWidth('Rio', 20));
    });

    it('gives a narrow string less room than a wide one of the same length', () => {
        expect(estimateTextWidth('llll', 10)).toBeLessThan(estimateTextWidth('MMMM', 10));
    });

    it('adds the tracking a letterSpacing would', () => {
        expect(estimateTextWidth('AFRICA', 9, 0.04)).toBeCloseTo(estimateTextWidth('AFRICA', 9) + 6 * 0.04 * 9);
    });
});

describe('resolveMapLabels', () => {
    it('leaves a label on the side it asked for when nothing is in the way', () => {
        const placed = resolveMapLabels([label({ dir: 'e' })], { bounds: BOUNDS });
        expect(placed[0].dir).toBe('e');
        expect(placed[0].textAnchor).toBe('start');
        expect(placed[0].x).toBeGreaterThan(400);
    });

    it('keeps the label clear of the node it names', () => {
        const node = circleRect(400, 230, 7);
        const placed = resolveMapLabels([label()], { bounds: BOUNDS, obstacles: [node] });
        expect(overlaps(placed[0].box, node)).toBe(false);
    });

    it('moves a label off its preferred side when a marker has taken it', () => {
        // A pawn row sitting directly above the node, exactly where 'n' wants to go.
        const pawns: Rect = { x: 390, y: 230 - 20, width: 20, height: 8 };
        const placed = resolveMapLabels([label({ dir: 'n' })], { bounds: BOUNDS, obstacles: [pawns] });
        expect(placed[0].dir).not.toBe('n');
        expect(overlaps(placed[0].box, pawns)).toBe(false);
    });

    it('does not let two labels of neighbouring nodes overlap', () => {
        const placed = resolveMapLabels(
            [label({ x: 400, y: 230, text: 'Baghdad' }), label({ x: 404, y: 244, text: 'Riyadh' })],
            { bounds: BOUNDS },
        );
        expect(overlaps(placed[0].box, placed[1].box)).toBe(false);
    });

    it('turns a label inwards rather than letting it run off the map', () => {
        const placed = resolveMapLabels([label({ x: 795, y: 230, text: 'Sydney', dir: 'e' })], { bounds: BOUNDS });
        expect(placed[0].box.x + placed[0].box.width).toBeLessThanOrEqual(BOUNDS.width);
    });

    it('places a whole crowded map without a single collision', () => {
        // A 6×6 grid at Outbreak's node spacing, every name wanting north.
        const requests: MapLabelRequest[] = [];
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                requests.push(label({ x: 80 + col * 40, y: 80 + row * 40, text: `City ${row}${col}` }));
            }
        }
        const nodes = requests.map(r => circleRect(r.x, r.y, 7));
        const placed = resolveMapLabels(requests, { bounds: BOUNDS, obstacles: nodes });

        placed.forEach((p, i) => {
            expect(nodes.some(node => overlaps(p.box, node))).toBe(false);
            placed.slice(i + 1).forEach(other => expect(overlaps(p.box, other.box)).toBe(false));
        });
    });

    it('keeps a moved label nearer its own node than any other', () => {
        // Two nodes close together, the left one's preferred side blocked so it
        // has to move: it must not end up hugging its neighbour.
        const blocker: Rect = { x: 380, y: 205, width: 40, height: 10 };
        const requests = [label({ x: 400, y: 230, text: 'Khartoum' }), label({ x: 424, y: 239, text: 'Riyadh' })];
        const nodes = requests.map(r => circleRect(r.x, r.y, 7));
        const placed = resolveMapLabels(requests, { bounds: BOUNDS, obstacles: [blocker, ...nodes] });

        const reach = (box: Rect, x: number, y: number) => Math.hypot(
            Math.max(box.x - x, 0, x - (box.x + box.width)),
            Math.max(box.y - y, 0, y - (box.y + box.height)));
        expect(placed[0].dir).not.toBe('n');
        placed.forEach((p, i) => {
            const own = reach(p.box, requests[i].x, requests[i].y);
            requests.forEach((other, j) => {
                if (j !== i) expect(reach(p.box, other.x, other.y)).toBeGreaterThanOrEqual(own);
            });
        });
    });

    it('places every name on the real Outbreak and Train Time boards without a collision', () => {
        const boards: [string, { name: string; x: number; y: number; labelDir: MapLabelDir }[], Rect, number, number][] = [
            ['outbreak', OUTBREAK_CITIES, { x: 0, y: 0, ...OUTBREAK_VIEWBOX }, 6, 11],
            ['traintime', TRAIN_CITIES, { x: 0, y: 0, ...TRAIN_VIEWBOX }, 17, 14],
        ];
        for (const [board, nodes, bounds, fontSize, offset] of boards) {
            const fences = nodes.map(n => circleRect(n.x, n.y, offset - 2));
            const placed = resolveMapLabels(
                nodes.map(n => ({ x: n.x, y: n.y, text: n.name, fontSize, offset, dir: n.labelDir })),
                { bounds, obstacles: fences },
            );
            placed.forEach((p, i) => {
                expect(fences.some(f => overlaps(p.box, f)), `${board}: ${nodes[i].name} on a node`).toBe(false);
                placed.slice(i + 1).forEach((other, k) => {
                    expect(overlaps(p.box, other.box), `${board}: ${nodes[i].name} on ${nodes[i + 1 + k].name}`).toBe(false);
                });
            });
        }
    });

    it('returns results in the order the requests came in, not the order it placed them', () => {
        const requests = [
            label({ x: 100, y: 100, text: 'Alone' }),
            label({ x: 400, y: 230, text: 'Crowded' }),
            label({ x: 404, y: 240, text: 'AlsoCrowded' }),
        ];
        const placed = resolveMapLabels(requests, { bounds: BOUNDS });
        expect(placed).toHaveLength(3);
        expect(placed[0].box.x).toBeLessThan(200);
        expect(placed[1].box.x).toBeGreaterThan(300);
    });
});

describe('textRect', () => {
    it('boxes the text on the side its anchor implies', () => {
        expect(textRect(100, 50, 'Tokyo', 10, 'start').x).toBe(100);
        expect(textRect(100, 50, 'Tokyo', 10, 'end').x).toBeLessThan(100);
        expect(textRect(100, 50, 'Tokyo', 10).x).toBeLessThan(100);
        expect(textRect(100, 50, 'Tokyo', 10).y).toBeLessThan(50);
    });
});
