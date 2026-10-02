import { describe, expect, it } from 'vitest';
import { exactZoom, FIT_WIDTH, focusZoom, glideFrame, pinchOffset, wheelZoomFactor, zoomLevels } from './boardZoom';

describe('zoomLevels', () => {
    it("steps fit, the board's own width, then twice it", () => {
        expect(zoomLevels(240)).toEqual([100, 240, 480]);
    });

    it("takes a board's own deep step over the doubled default", () => {
        expect(zoomLevels(240, 640)).toEqual([100, 240, 640]);
    });

    it('never lets the deep step fall below the first one', () => {
        expect(zoomLevels(240, 180)).toEqual([100, 240, 240]);
    });

    it('gives a board that wants no more than its column a single stop', () => {
        expect(zoomLevels(FIT_WIDTH)).toEqual([FIT_WIDTH]);
        expect(zoomLevels(80)).toEqual([FIT_WIDTH]);
        expect(zoomLevels(Number.NaN)).toEqual([FIT_WIDTH]);
    });
});

describe('focusZoom', () => {
    const levels = zoomLevels(240, 640);

    it('picks the deepest level when the region is small enough for all of them', () => {
        expect(focusZoom(levels, 100, 2835, 320, 32)).toBe(640);
    });

    it('stops at the level the region still fits, rather than overshooting', () => {
        expect(focusZoom(levels, 756, 2835, 320, 32)).toBe(240);
    });

    it('falls back to fit when even the shallowest step overflows the pane', () => {
        expect(focusZoom(levels, 3000, 2835, 320, 32)).toBe(FIT_WIDTH);
    });

    it('falls back to fit once the margin alone consumes the whole pane', () => {
        expect(focusZoom(levels, 10, 2835, 64, 32)).toBe(FIT_WIDTH);
    });

    it('falls back to fit on a degenerate size rather than dividing by zero', () => {
        expect(focusZoom(levels, 0, 2835, 320, 32)).toBe(FIT_WIDTH);
        expect(focusZoom(levels, 100, 0, 320, 32)).toBe(FIT_WIDTH);
        expect(focusZoom(levels, 100, 2835, 0, 32)).toBe(FIT_WIDTH);
    });
});

describe('wheelZoomFactor', () => {
    it('zooms in scrolling up and out scrolling down', () => {
        expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
        expect(wheelZoomFactor(100, 0)).toBeLessThan(1);
        expect(wheelZoomFactor(0, 0)).toBe(1);
    });

    it('translates a wheel that reports lines or pages rather than pixels', () => {
        // Three lines is a notch on a mouse wheel; untranslated it would move
        // the board by a third of a percent.
        expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(48, 0));
        expect(wheelZoomFactor(1, 2)).toBeCloseTo(wheelZoomFactor(100, 0));
    });

    it('treats an unknown deltaMode as pixels rather than throwing', () => {
        expect(wheelZoomFactor(100, 9)).toBe(wheelZoomFactor(100, 0));
    });
});

describe('pinchOffset', () => {
    it('keeps the point under the fingers put when they spread without moving', () => {
        // Scrolled 100 in, fingers at 50: content point 150 doubles to 300 and stays at 50.
        expect(pinchOffset(100, 50, 50, 2, 1000, 320)).toBe(-250);
    });

    it('carries the board with the fingers as they travel', () => {
        expect(pinchOffset(100, 50, 80, 1, 1000, 320)).toBe(-70);
    });

    it('never opens a gap before the board starts', () => {
        expect(pinchOffset(0, 50, 200, 1, 1000, 320)).toBe(0);
    });

    it('never opens a gap past the board end', () => {
        // Zooming out to half of 1000 leaves 500 of board; it can sit no further left than -180.
        expect(pinchOffset(680, 300, 300, 0.5, 1000, 320)).toBe(-180);
    });
});

describe('glideFrame', () => {
    const pane = { x: 300, y: 450 };
    // Fitted, scrolled nowhere; and at 640%, scrolled to the far corner.
    const fitted = { zoom: 100, scroll: { x: 0, y: 0 }, content: { x: 300, y: 450 } };
    const deep = { zoom: 640, scroll: { x: 1620, y: 2430 }, content: { x: 1920, y: 2880 } };

    it('starts exactly where the board already is', () => {
        expect(glideFrame(fitted, deep, pane, 0)).toEqual({ zoom: 100, offset: { x: 0, y: 0 } });
        const from = { zoom: 240, scroll: { x: 200, y: 300 }, content: { x: 720, y: 1080 } };
        const frame = glideFrame(from, deep, pane, 0);
        expect(frame.zoom).toBe(240);
        expect(frame.offset.x).toBeCloseTo(-200);
        expect(frame.offset.y).toBeCloseTo(-300);
    });

    it('ends exactly where the focus wants it', () => {
        const frame = glideFrame(fitted, deep, pane, 1);
        expect(frame.zoom).toBeCloseTo(640);
        expect(frame.offset.x).toBeCloseTo(-1620);
        expect(frame.offset.y).toBeCloseTo(-2430);
    });

    it('grows the zoom by the same factor each step, never passing through fit on the way', () => {
        const half = glideFrame(fitted, deep, pane, 0.5).zoom;
        expect(half).toBeCloseTo(Math.sqrt(100 * 640));
        const back = glideFrame(deep, { ...deep, zoom: 240, content: { x: 720, y: 1080 }, scroll: { x: 420, y: 630 } }, pane, 0.5).zoom;
        expect(back).toBeGreaterThan(240);
        expect(back).toBeLessThan(640);
    });

    it('never opens a gap at an edge of the pane', () => {
        for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
            const { zoom, offset } = glideFrame(fitted, deep, pane, t);
            const size = { x: 1920 * zoom / 640, y: 2880 * zoom / 640 };
            expect(offset.x).toBeLessThanOrEqual(0);
            expect(offset.y).toBeLessThanOrEqual(0);
            expect(offset.x + size.x).toBeGreaterThanOrEqual(pane.x - 1e-9);
            expect(offset.y + size.y).toBeGreaterThanOrEqual(pane.y - 1e-9);
        }
    });
});

describe('exactZoom', () => {
    const viewBox = { width: 360, height: 480 };
    const pane = { width: 343, height: 457 };

    it('zooms to exactly the width that fits the region, between the steps', () => {
        const zoom = exactZoom({ width: 240, height: 100 }, viewBox, pane, 28, 360);
        expect(zoom).toBeCloseTo(150 * (1 - 56 / 343));
    });

    it('is held by the height when that runs out first', () => {
        const zoom = exactZoom({ width: 60, height: 300 }, viewBox, pane, 28, 360);
        expect(zoom).toBeCloseTo(160 * (1 - 56 / 457));
    });

    it('never goes below fit or past the deepest step', () => {
        expect(exactZoom({ width: 400, height: 100 }, viewBox, pane, 28, 360)).toBe(FIT_WIDTH);
        expect(exactZoom({ width: 10, height: 10 }, viewBox, pane, 28, 360)).toBe(360);
        expect(exactZoom({ width: 0, height: 10 }, viewBox, pane, 28, 360)).toBe(FIT_WIDTH);
    });
});
