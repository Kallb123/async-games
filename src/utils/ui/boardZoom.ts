/**
 * The two pieces of arithmetic behind `BoardZoom`, kept out here so they can be
 * tested the way the rest of the shared board kit's maths is (`mapEdges.ts`,
 * `mapLabels.ts`). Everything else in that component is DOM and gestures.
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
    const ceiling = ((100 * viewBoxWidth) / rectWidth) * (1 - (2 * marginPx) / paneWidth);
    const fitting = levels.filter(level => level <= ceiling);
    return fitting.length > 0 ? Math.max(...fitting) : FIT_WIDTH;
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
    const offset = finger - (scroll + startFinger) * scale;
    return Math.min(0, Math.max(paneSize - contentSize * scale, offset));
}
