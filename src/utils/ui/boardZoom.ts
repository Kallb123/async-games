/**
 * The arithmetic behind `BoardZoom`, kept out here so it can be tested the way
 * the rest of the shared board kit's maths is (`mapEdges.ts`, `mapLabels.ts`).
 * Everything else in that component is DOM and gestures.
 */

/** The width the board is drawn at when it's fitted to the column, as a percentage. */
export const FIT_WIDTH = 100;

/**
 * The widths the zoom pill steps through, in order: fitted, the board's own
 * first step, and a deeper one. The deep step is twice the first unless the
 * board names its own, and can never come out below it — a board asking for
 * less than its own first step gets that step twice over rather than a ladder
 * that goes backwards. A board that wants no more than the column it sits in
 * gets the single stop, and the pill isn't drawn at all.
 */
export function zoomLevels(zoomWidth: number, maxWidth?: number): number[] {
    if (!(zoomWidth > FIT_WIDTH)) return [FIT_WIDTH];
    return [FIT_WIDTH, zoomWidth, Math.max(zoomWidth, maxWidth ?? zoomWidth * 2)];
}

/**
 * How much one ctrl-wheel notch multiplies the zoom by. `deltaMode` has to be
 * read: a wheel reporting lines (1) or pages (2) sends single digits where a
 * trackpad sends hundreds, and untranslated it would move the board by a
 * fraction of a percent per notch. Scrolling up zooms in, as every map does.
 */
const DELTA_TO_PIXELS = [1, 16, 100];

export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
    return Math.exp(-(deltaY * (DELTA_TO_PIXELS[deltaMode] ?? 1)) / 220);
}

/**
 * The deepest of `levels` that still leaves a `rectWidth`-wide region (plus
 * `marginPx` of breathing room on each side) fitting across a `paneWidth`-wide
 * pane, given the child's own `viewBoxWidth` — the step `BoardZoom`'s
 * auto-focus picks to bring a roll's car-and-destinations into view already
 * zoomed in as far as it usefully can be. Falls back to `FIT_WIDTH` when even
 * that step's region is wider than the pane: there is no level left that does
 * better, so the fit is the honest answer rather than an overflowing "deep" one.
 */
export function focusZoom(levels: number[], rectWidth: number, viewBoxWidth: number, paneWidth: number, marginPx: number): number {
    if (!(rectWidth > 0) || !(viewBoxWidth > 0) || !(paneWidth > 0)) return FIT_WIDTH;
    const ceiling = fillZoom(rectWidth, viewBoxWidth, paneWidth, marginPx);
    const fitting = levels.filter(level => level <= ceiling);
    return fitting.length > 0 ? Math.max(...fitting) : FIT_WIDTH;
}

/**
 * The zoom at which a `rect`-sized region (plus `marginPx` of breathing room
 * on every side) exactly fills the pane, across or down, whichever runs out
 * first — between fit and `max`, rather than snapped to one of the pill's
 * steps as `focusZoom` is. For a region a step would show too little or too
 * much of: a character's reach, which at full AP runs most of a board's width
 * and so would fall right back to the fit. Down is measured against the
 * pane's own height, which is the board's fitted height at every zoom.
 */
export function exactZoom(rect: Size, viewBox: Size, pane: Size, marginPx: number, max: number): number {
    if (!(rect.width > 0) || !(rect.height > 0) || !(pane.width > 0) || !(pane.height > 0)) return FIT_WIDTH;
    const across = fillZoom(rect.width, viewBox.width, pane.width, marginPx);
    const down = fillZoom(rect.height, viewBox.height, pane.height, marginPx);
    return Math.min(max, Math.max(FIT_WIDTH, Math.min(across, down)));
}

interface Size { width: number; height: number }

/** The zoom at which `rect` of the child's `view` units, plus `marginPx` either side, just fills `pane` pixels along one axis. */
function fillZoom(rect: number, view: number, pane: number, marginPx: number): number {
    return ((100 * view) / rect) * (1 - (2 * marginPx) / pane);
}

/**
 * Where a pinch leaves the board along one axis: the offset of the board's
 * top-left corner from the pane's, in pixels (zero or negative — the board
 * never pulls away from the frame's edge). The content point that sat under
 * the fingers when the pinch began (`scroll + startFinger`, at the board's
 * size then) is scaled by `scale` and kept under where the fingers are now,
 * so the board both zooms about the fingers and travels with them.
 * `contentSize` is the board's size along this axis when the pinch began,
 * `paneSize` the frame's; the result is clamped so no gap opens at either
 * end, and `-offset` is the scroll position to commit once the pinch ends.
 */
export function pinchOffset(scroll: number, startFinger: number, finger: number, scale: number, contentSize: number, paneSize: number): number {
    return clampOffset(finger - (scroll + startFinger) * scale, contentSize * scale, paneSize);
}

/**
 * The board's offset in the pane along one axis, held to what a scrolled pane
 * could show: zero or negative, and never so far that a gap opens at the far
 * end. `-clampOffset(-scroll, …)` is the same rule for a scroll position.
 */
export function clampOffset(offset: number, contentSize: number, paneSize: number): number {
    return Math.min(0, Math.max(paneSize - contentSize, offset));
}

/**
 * The scroll that puts `point` — in the child's own `viewBox` units — in the
 * middle of the pane, given the board's size on screen (`content`) and the
 * pane's (`pane`), both in pixels. Held between nothing scrolled and the far
 * end of the board on each axis, as a pane can't scroll further; a board no
 * bigger than the pane along an axis has nothing to scroll there, so that axis
 * is zero.
 */
export function centredScroll(point: { x: number; y: number }, viewBox: Size, content: { x: number; y: number }, pane: { x: number; y: number }): { x: number; y: number } {
    const axis = (at: number, view: number, size: number, room: number) => Math.min(Math.max(0, size - room), Math.max(0, at / view * size - room / 2));
    return {
        x: axis(point.x, viewBox.width, content.x, pane.x),
        y: axis(point.y, viewBox.height, content.y, pane.y),
    };
}

/** Ease in and out (cubic): a glide sets off and arrives gently rather than lurching. */
export function easeInOut(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** A board as drawn in its pane: its zoom, how far the pane is scrolled into it, and its size at that zoom, in pixels. */
export interface ZoomView {
    zoom: number;
    scroll: { x: number; y: number };
    content: { x: number; y: number };
}

/**
 * One frame of a focus gliding the board from the view it was in to the one it
 * is heading for, `t` of the way there (eased by the caller). The zoom moves
 * geometrically — each frame grows it by the same factor, so a step from fit to
 * 640% doesn't spend half its time below 200% — and the point at the middle of
 * the pane moves straight across the board. The result is the zoom drawn and
 * the board's offset in the pane, through `clampOffset` so no gap opens at an
 * edge; `t` = 0 is exactly `from` (nothing jumps as the glide
 * begins) and `t` = 1 exactly `to`.
 */
export function glideFrame(from: ZoomView, to: ZoomView, pane: { x: number; y: number }, t: number): { zoom: number; offset: { x: number; y: number } } {
    const zoom = from.zoom * Math.pow(to.zoom / from.zoom, t);
    const axis = (key: 'x' | 'y') => {
        const start = (from.scroll[key] + pane[key] / 2) / (from.content[key] || 1);
        const end = (to.scroll[key] + pane[key] / 2) / (to.content[key] || 1);
        const centre = start + (end - start) * t;
        const size = to.content[key] * zoom / to.zoom;
        return clampOffset(pane[key] / 2 - centre * size, size, pane[key]);
    };
    return { zoom, offset: { x: axis('x'), y: axis('y') } };
}
