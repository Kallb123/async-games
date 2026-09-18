import { describe, expect, it } from 'vitest';
import { FIT_WIDTH, focusZoom, wheelZoomFactor, zoomLevels } from './boardZoom';

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
