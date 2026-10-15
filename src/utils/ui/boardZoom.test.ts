import { describe, expect, it } from 'vitest';
import { centredScroll, drawnView, exactZoom, FIT_WIDTH, focusZoom, glideFrame, pinchOffset, viewRegion, wheelZoomFactor, zoomLevels } from './boardZoom';

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

    it("keeps a map-sized deep range in order, at 1,500% and more", () => {
        expect(zoomLevels(625, 1500)).toEqual([100, 625, 1500]);
        expect(focusZoom(zoomLevels(625, 1500), 10, 181, 390, 28)).toBe(1500);
        expect(exactZoom({ width: 4, height: 4 }, { width: 181, height: 127 }, { width: 390, height: 270 }, 28, 1500)).toBe(1500);
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

    it('is the same with no inset as with an inset of zero', () => {
        const rect = { width: 60, height: 300 };
        expect(exactZoom(rect, viewBox, pane, 28, 360, 0)).toBe(exactZoom(rect, viewBox, pane, 28, 360));
    });

    it('keeps a strip at the foot clear when the height runs out first', () => {
        const zoom = exactZoom({ width: 60, height: 300 }, viewBox, pane, 28, 360, 60);
        expect(zoom).toBeCloseTo(160 * (1 - (56 + 60) / 457));
        expect(zoom).toBeLessThan(exactZoom({ width: 60, height: 300 }, viewBox, pane, 28, 360));
    });

    it('leaves a region held by its width alone', () => {
        const rect = { width: 240, height: 100 };
        expect(exactZoom(rect, viewBox, pane, 28, 360, 60)).toBe(exactZoom(rect, viewBox, pane, 28, 360));
    });

    it('falls back to fit when the inset leaves no room down the pane', () => {
        expect(exactZoom({ width: 60, height: 300 }, viewBox, pane, 28, 360, 500)).toBe(FIT_WIDTH);
    });

    it('ignores a negative inset rather than zooming past the margin', () => {
        const rect = { width: 60, height: 300 };
        expect(exactZoom(rect, viewBox, pane, 28, 360, -40)).toBe(exactZoom(rect, viewBox, pane, 28, 360));
    });
});

describe('centredScroll', () => {
    const viewBox = { width: 400, height: 300 };
    const content = { x: 1600, y: 1200 };
    const pane = { x: 320, y: 480 };

    it('puts the point in the middle of the pane', () => {
        // Halfway across the board is 800px in; half a pane back from it is 640.
        expect(centredScroll({ x: 200, y: 150 }, viewBox, content, pane)).toEqual({ x: 640, y: 360 });
    });

    it('stops at the start of the board rather than scrolling before it', () => {
        expect(centredScroll({ x: 10, y: 5 }, viewBox, content, pane)).toEqual({ x: 0, y: 0 });
    });

    it('stops at the end of the board rather than scrolling past it', () => {
        expect(centredScroll({ x: 395, y: 298 }, viewBox, content, pane)).toEqual({ x: 1280, y: 720 });
    });

    it('has nothing to scroll along an axis the board does not overflow', () => {
        expect(centredScroll({ x: 200, y: 150 }, viewBox, { x: 300, y: 1200 }, pane)).toEqual({ x: 0, y: 360 });
        expect(centredScroll({ x: 200, y: 150 }, viewBox, { x: 300, y: 400 }, pane)).toEqual({ x: 0, y: 0 });
    });

    it('centres the point in the pane above an inset, half of it higher than the middle', () => {
        // The middle of the pane is 240 up; with 100px floating at the foot the room above is 380, middle 190.
        expect(centredScroll({ x: 200, y: 150 }, viewBox, content, pane, 100)).toEqual({ x: 640, y: 410 });
    });

    it('takes an inset of zero as no inset, and leaves the sideways axis alone', () => {
        expect(centredScroll({ x: 200, y: 150 }, viewBox, content, pane, 0)).toEqual(centredScroll({ x: 200, y: 150 }, viewBox, content, pane));
        expect(centredScroll({ x: 100, y: 150 }, viewBox, content, pane, 100).x).toBe(centredScroll({ x: 100, y: 150 }, viewBox, content, pane).x);
    });

    it('still stops at either end of the board with an inset', () => {
        expect(centredScroll({ x: 10, y: 0 }, viewBox, content, pane, 100)).toEqual({ x: 0, y: 0 });
        expect(centredScroll({ x: 395, y: 300 }, viewBox, content, pane, 100)).toEqual({ x: 1280, y: 720 });
    });

    it('takes a fraction of the board as readily as a point, for a viewBox of one', () => {
        expect(centredScroll({ x: 0.5, y: 0.5 }, { width: 1, height: 1 }, content, pane, 100)).toEqual({ x: 640, y: 410 });
    });
});

describe('drawnView', () => {
    it('is the board as laid out when it is drawn at its own size, unscrolled', () => {
        const view = drawnView({ x: 800, y: 600 }, { x: 0, y: 0 }, 1);
        expect(view.scroll.x).toBeCloseTo(0, 9);
        expect(view.scroll.y).toBeCloseTo(0, 9);
        expect(view.content).toEqual({ x: 800, y: 600 });
    });

    it('scrolls by the offset turned round, and sizes the board by the scale', () => {
        expect(drawnView({ x: 800, y: 600 }, { x: -120, y: -40 }, 1.5)).toEqual({ scroll: { x: 120, y: 40 }, content: { x: 1200, y: 900 } });
    });
});

describe('viewRegion', () => {
    const viewBox = { width: 400, height: 300 };
    const pane = { x: 320, y: 240 };

    it('shows the whole viewBox of a board fitted to its pane', () => {
        expect(viewRegion({ scroll: { x: 0, y: 0 }, content: { x: 320, y: 240 } }, pane, viewBox)).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    });

    it('shows a pane-sized part of a zoomed board, from where it is scrolled to', () => {
        // Four times the size, a quarter of the way along and half way down.
        const region = viewRegion({ scroll: { x: 320, y: 480 }, content: { x: 1280, y: 960 } }, pane, viewBox);
        expect(region).toEqual({ x: 100, y: 150, width: 100, height: 75 });
    });

    it('scales with the board, so a pinch halfway between two zooms shows a region halfway between', () => {
        const wide = viewRegion({ scroll: { x: 0, y: 0 }, content: { x: 640, y: 480 } }, pane, viewBox);
        expect(wide.width).toBe(200);
        expect(wide.height).toBe(150);
    });

    it('keeps the middle of the pane on the same point of the board when the board is zoomed about it', () => {
        const middle = (region: { x: number; y: number; width: number; height: number }) => ({ x: region.x + region.width / 2, y: region.y + region.height / 2 });
        // The point at (240, 150) of the viewBox is 192px across a 320px-wide board, 120px down a 240px-high one.
        const at = (zoom: number) => viewRegion({ scroll: { x: 240 / 400 * 320 * zoom - 160, y: 150 / 300 * 240 * zoom - 120 }, content: { x: 320 * zoom, y: 240 * zoom } }, pane, viewBox);
        for (const zoom of [2, 3.3, 6]) {
            expect(middle(at(zoom)).x).toBeCloseTo(240, 9);
            expect(middle(at(zoom)).y).toBeCloseTo(150, 9);
        }
    });

    it('never runs past the board, however far a scroll has been over-run or rounded', () => {
        const past = viewRegion({ scroll: { x: 970, y: -8 }, content: { x: 1280, y: 960 } }, pane, viewBox);
        expect(past.x + past.width).toBeLessThanOrEqual(400);
        expect(past.y).toBe(0);
    });

    it('shows all of an axis the board does not overflow', () => {
        expect(viewRegion({ scroll: { x: 0, y: 100 }, content: { x: 300, y: 960 } }, pane, viewBox)).toEqual({ x: 0, y: 31.25, width: 400, height: 75 });
    });

    it('is where centredScroll puts the point: the point is the middle of the region', () => {
        const content = { x: 1280, y: 960 };
        const point = { x: 123, y: 211 };
        const scroll = centredScroll(point, viewBox, content, { x: pane.x, y: pane.y });
        const region = viewRegion({ scroll, content }, pane, viewBox);
        expect(region.x + region.width / 2).toBeCloseTo(point.x, 9);
        expect(region.y + region.height / 2).toBeCloseTo(point.y, 9);
    });

    it('is what a glide shows at either end: the view it set off from, then the one it is heading for', () => {
        const from = { zoom: 100, scroll: { x: 0, y: 0 }, content: { x: 320, y: 240 } };
        const to = { zoom: 400, scroll: { x: 640, y: 480 }, content: { x: 1280, y: 960 } };
        const shown = (t: number) => {
            const frame = glideFrame(from, to, { x: 320, y: 240 }, t);
            const scale = frame.zoom / to.zoom;
            return viewRegion(drawnView(to.content, frame.offset, scale), pane, viewBox);
        };
        expect(shown(0)).toEqual({ x: 0, y: 0, width: 400, height: 300 });
        const end = shown(1);
        expect(end.x).toBeCloseTo(200, 6);
        expect(end.width).toBeCloseTo(100, 6);
    });
});
