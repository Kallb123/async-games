import { describe, expect, it } from 'vitest';
import { ISO_HALF_HEIGHT, ISO_HALF_WIDTH, ISO_STOREY, isoBlock, isoBounds, isoCentre, isoPoint, isoRuns, isoSquareAt, isoView, type IsoGrid } from './isometric';

/** A 3×2 grid, flat but for the middle square of the top row, a storey up. */
const GRID: IsoGrid = { width: 3, height: 2, heights: [0, 1, 0, 0, 0, 0] };
const VIEW = isoView(GRID, { base: 1, headroom: 4 });

describe('isoView', () => {
    it('fits the whole diamond, the slab under it, and the headroom over the tallest square', () => {
        expect(VIEW.size).toEqual({
            width: 5 * ISO_HALF_WIDTH,
            height: 4 + ISO_STOREY + 5 * ISO_HALF_HEIGHT + ISO_STOREY,
        });
        // The map's left corner, the back corner raised to the tallest square plus headroom, and the front corner on the slab's foot.
        expect(isoPoint(VIEW, 0, 2, 0).x).toBe(0);
        expect(isoPoint(VIEW, 0, 0, VIEW.top).y).toBe(4);
        expect(isoPoint(VIEW, 3, 2, -VIEW.base).y).toBe(VIEW.size.height);
    });

    it('pads a board shallower than the least aspect above and below, keeping it centred', () => {
        const tall = isoView(GRID, { base: 1, headroom: 4, minAspect: 1 });
        expect(tall.size.height).toBe(tall.size.width);
        const pad = (tall.size.height - VIEW.size.height) / 2;
        expect(tall.origin.y).toBe(VIEW.origin.y + pad);
    });
});

describe('isoCentre', () => {
    it('stands on the middle of the square, raised by its height', () => {
        const ground = isoCentre(VIEW, 4);
        expect(ground).toEqual(isoPoint(VIEW, 1.5, 1.5, 0));
        expect(isoCentre(VIEW, 1).y).toBe(isoPoint(VIEW, 1.5, 0.5, 0).y - ISO_STOREY);
    });
});

describe('isoBlock', () => {
    it('shows a raised square\'s front faces down to the lower squares in front of it', () => {
        const block = isoBlock(VIEW, 1);
        expect(block.left).not.toBeNull();
        expect(block.right).not.toBeNull();
    });

    it('draws no face toward a square as high as it', () => {
        const ledge = isoView({ width: 2, height: 1, heights: [1, 1] }, { base: 0, headroom: 0 });
        expect(isoBlock(ledge, 0).right).toBeNull();
        // The next row is off the map: the ground, so the face shows.
        expect(isoBlock(ledge, 0).left).not.toBeNull();
    });
});

describe('isoRuns', () => {
    it('merges a row\'s run of one key and one height, and splits it where the height changes', () => {
        const runs = isoRuns(VIEW, () => 'all');
        expect(runs).toHaveLength(1);
        // The top row breaks into three at the raised square; the bottom row is one run.
        expect(runs[0].d.match(/M/g)).toHaveLength(4);
    });

    it('leaves out a square with no key', () => {
        expect(isoRuns(VIEW, square => square === 0 ? 'one' : undefined)[0].d.match(/M/g)).toHaveLength(1);
    });
});

describe('isoBounds', () => {
    it('covers a rectangle of the grid from the ground to the tallest top', () => {
        const all = isoBounds(VIEW, { x: 0, y: 0, width: 3, height: 2 });
        expect(all).toEqual({ x: 0, y: isoPoint(VIEW, 0, 0, VIEW.top).y, width: VIEW.size.width, height: 5 * ISO_HALF_HEIGHT + ISO_STOREY });
    });
});

describe('isoSquareAt', () => {
    it('finds the square under the middle of each top', () => {
        for (let square = 0; square < GRID.heights.length; square++) {
            const { x, y } = isoCentre(VIEW, square);
            expect(isoSquareAt(VIEW, x, y)).toBe(square);
        }
    });

    it('gives a raised square\'s face to that square, not the ground drawn behind it', () => {
        // Just above the raised square's front corner on the ground: on its face.
        const foot = isoPoint(VIEW, 2, 1, 0);
        expect(isoSquareAt(VIEW, foot.x, foot.y - 1)).toBe(1);
    });

    it('is undefined off the map', () => {
        expect(isoSquareAt(VIEW, 0, 0)).toBeUndefined();
        expect(isoSquareAt(VIEW, VIEW.size.width, VIEW.size.height)).toBeUndefined();
    });
});
