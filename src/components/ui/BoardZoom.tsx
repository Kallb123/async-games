'use client'
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { centredScroll, drawnView, easeInOut, exactZoom, FIT_WIDTH, FOCUS_MARGIN_PX, focusZoom, GLIDE_LEAD, GLIDE_MS, glideFrame, pinchOffset, wheelZoomFactor, zoomLevels, type ZoomView } from '@/utils/ui/boardZoom';
import { prefersReducedMotion } from '@/utils/hooks/usePrefersReducedMotion';
import type { Rect } from '@/utils/ui/mapLabels';
import { BoardViewContext, ViewFeed } from '@/components/ui/boardView';

/**
 * A region worth bringing into view on its own, unprompted — a roll landing,
 * say — rather than left for the player to find by hand. `rect` is in the
 * child SVG's own viewBox units; `key` is whatever changes each time the
 * focus should (re)apply, so a board can pass the same rect twice without
 * re-triggering the scroll (the player may have since panned away on purpose).
 */
export interface BoardZoomFocus {
    rect: Rect;
    key: string;
    /**
     * Zoom to exactly the width that fits `rect`, anywhere between fit and
     * the deepest step, rather than to the deepest step it fits at. For a
     * region the steps would frame badly either way (`exactZoom`).
     */
    exact?: boolean;
    /**
     * Pixels at the foot of the pane the region must stay clear of, because
     * something floats there — Realm Arena's caption over the bottom of its
     * board. An `exact` zoom fits `rect` into the pane above it (`exactZoom`; the
     * steps a plain focus chooses between are picked by width, which a strip at
     * the foot doesn't change), and `rect` is centred in that part rather than
     * in the whole pane. Defaults to 0: nothing floats there.
     */
    inset?: number;
}

/**
 * The board redrawn under the player — turned a quarter, say — so the part of
 * it they were looking at has moved. Whenever `key` changes, `at` is handed
 * the point (in the child SVG's viewBox units) that was in the middle of the
 * pane and gives where that same thing is now, and the pane is scrolled to
 * put it back in the middle, at the zoom it was already at. A board drawn
 * the same size either way is the only kind this suits.
 */
export interface BoardZoomPivot {
    key: string;
    at: (point: { x: number; y: number }) => { x: number; y: number };
}

interface BoardZoomProps {
    /** Percentage of the column the board is stretched to at the first zoom step, e.g. 260. */
    zoomWidth: number;
    /**
     * The second step, and the ceiling a pinch may reach. Defaults to twice
     * `zoomWidth`, which is as far as a node-and-edge map ever needs to go; a
     * board whose pieces are still tiny at that — Race Cars draws 214 spaces
     * across a 78-row circuit — names its own.
     */
    maxWidth?: number;
    /** The child SVG's own viewBox size — required only alongside `focus`. */
    viewBox?: { width: number; height: number };
    /** A region to smooth-scroll (and zoom) to reveal whenever `focus.key` changes. */
    focus?: BoardZoomFocus | null;
    /**
     * Told each focus's key once the board has all but got there — `GLIDE_LEAD`
     * of the way through its glide, or as it is cut short or skipped — so a
     * board can hold what it plays until the view is nearly where it is going.
     */
    onFocused?: (key: string) => void;
    /** Keeps the player's place when the board is redrawn under them. Needs `viewBox`. */
    pivot?: BoardZoomPivot | null;
    /**
     * Camera mode, for a board drawn by a camera rather than laid out by the
     * browser — a WebGL canvas, which can't be made 600% of the column wide.
     * Needs `viewBox`, and is fixed for the life of the component. The zoom,
     * the pill, the pinch, the glide and the scrolling are all as they are, but
     * what is scrolled is an empty spacer of the zoomed board's size, and the
     * child is not the board `<svg>` but a box pinned to the pane (`sticky`,
     * filling what the pane shows) that draws whatever part of the board it is
     * told is in view (`useBoardView`) — never transformed, never laid out
     * bigger than the pane. A child that takes presses itself, as a canvas
     * would for a tap, leaves the pan and the pinch to the pane (`touch-action`).
     */
    camera?: boolean;
    /** The board <svg> or, in camera mode, the box the camera draws into. */
    children: React.ReactNode;
}

/**
 * The content point a focus should centre, as a fraction of the whole board,
 * and — for a smooth one — the view it glides from, recorded before its zoom
 * changed.
 */
interface FocusTarget { cx: number; cy: number; inset: number; smooth: boolean; from?: ZoomView; landed?: () => void }

/** The class on the board while a pinch or a glide is drawing it (`drawAt`). */
const MOVING = 'ag-board-zoom-content--moving';

/**
 * A focus glide in flight. Like a pinch, it is drawn as a CSS transform over a
 * board already laid out at the zoom it's heading for, with the pane unscrolled
 * underneath; `settle` drops the transform and scrolls the pane to where the
 * glide ends, so whatever interrupts it reads a board that is simply there. A
 * glide that has finished settles to nothing. `settled` says whether it has.
 */
interface Glide { settle: () => void; settled: () => boolean }

/**
 * What a board is drawn on, as the verbs a pinch, a glide and a follow need:
 * the pane that scrolls it, and the four ways of putting the board in it. A
 * board laid out by the browser is moved by a CSS transform (`transformSurface`);
 * a camera's is told what part of it is in view instead (`cameraSurface`).
 */
interface Surface {
    pane: HTMLDivElement;
    /** Draw the board `offset` into the pane at `scale` times its laid-out size. */
    drawAt: (offset: { x: number; y: number }, scale: number) => void;
    /** Stop drawing it so: the board is as laid out again. */
    release: () => void;
    /** Hand the board's position over to `drawAt` — to the frame it opens on — for a pinch, a glide or a follow. */
    liftOff: (offset: { x: number; y: number }, scale?: number) => void;
    /** And hand it back: released, the pane scrolled to `scroll`. */
    landAt: (scroll: { x: number; y: number }) => void;
    /** The pane has just been scrolled by hand, not through `landAt`. */
    scrolled: () => void;
}

/**
 * The surface of a board the browser lays out. Drawn `offset` into the pane at
 * `scale` times its size, it's marked as moving (`MOVING`), which makes it a
 * compositor layer of its own (ag-theme.css) — so each frame scales what's
 * already drawn instead of re-rasterising the whole board — and lets a board
 * switch off its own pulses for the gesture (Realm Arena's, in ag-theme.css):
 * an animation inside the SVG — even paused — has the whole board re-rastered
 * at every frame's scale, which is what makes a pinch stutter. A board names
 * its animated classes under the marker rather than `*`, which would restyle
 * every node on it as each gesture starts and ends.
 */
function transformSurface(pane: HTMLDivElement, content: HTMLDivElement): Surface {
    const drawAt: Surface['drawAt'] = (offset, scale) => {
        content.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
        content.classList.add(MOVING);
    };
    // The board is drawn as laid out again, sharp at its new zoom, and its pulses start over.
    const release = () => {
        content.style.transform = '';
        content.classList.remove(MOVING);
    };
    return {
        pane,
        drawAt,
        release,
        // For as long as a pinch or a glide is drawing, the pane sits unscrolled
        // and the transform alone places the board: left scrolled, a board scaled
        // down under the scroll position would have the browser clamp it — and
        // the board would lurch mid-gesture.
        liftOff: (offset, scale = 1) => {
            pane.scrollLeft = 0;
            pane.scrollTop = 0;
            drawAt(offset, scale);
        },
        landAt: scroll => {
            release();
            pane.scrollLeft = scroll.x;
            pane.scrollTop = scroll.y;
        },
        scrolled: () => {},
    };
}

/**
 * The surface of a camera. Nothing is transformed: what is drawn between
 * frames is told to the camera as the view it makes (`ViewFeed`), and a pane
 * that scrolls is told the same. A camera has no transform to be scrolled
 * under, so lifting off leaves the pane where it is, and the camera's own
 * canvas already shows the frame a glide opens on.
 */
function cameraSurface(pane: HTMLDivElement, feed: ViewFeed): Surface {
    return {
        pane,
        drawAt: (offset, scale) => feed.draw(offset, scale),
        release: () => feed.drop(),
        liftOff: (offset, scale = 1) => feed.draw(offset, scale),
        landAt: scroll => {
            feed.drop();
            pane.scrollLeft = scroll.x;
            pane.scrollTop = scroll.y;
            feed.sync();
        },
        scrolled: () => feed.sync(),
    };
}

/** The board as it's drawn right now: mid-pinch, the pinch's latest frame; otherwise the zoom and scroll laid out. */
function currentView(pane: HTMLDivElement, zoom: number, pinch: Pinch | null): ZoomView {
    if (pinch) return pinchView(pinch);
    return {
        zoom,
        scroll: { x: pane.scrollLeft, y: pane.scrollTop },
        content: { x: pane.scrollWidth, y: pane.scrollHeight },
    };
}

/**
 * Where a focus leaves a board already laid out at the zoom it wants — and,
 * since the frame keeps its fitted height and so can itself be taller than the
 * screen (a long circuit fitted to a phone's width), the page is moved too
 * where the focus would still land off-screen once the pane has scrolled. Only
 * then: a board already in view shouldn't drag the page about.
 */
function focusView(pane: HTMLDivElement, target: FocusTarget, zoom: number): ZoomView {
    const content = { x: pane.scrollWidth, y: pane.scrollHeight };
    // The target is a fraction of the board, which is its viewBox taken as 1 x 1.
    const scroll = centredScroll({ x: target.cx, y: target.cy }, { width: 1, height: 1 }, content, { x: pane.clientWidth, y: pane.clientHeight }, target.inset);
    const pointY = pane.getBoundingClientRect().top + target.cy * content.y - scroll.y;
    if (pointY < FOCUS_MARGIN_PX || pointY > window.innerHeight - FOCUS_MARGIN_PX) {
        window.scrollTo({ top: Math.max(0, window.scrollY + pointY - window.innerHeight / 2), behavior: target.smooth ? 'smooth' : 'auto' });
    }
    return { zoom, scroll, content };
}

/**
 * Glide the board from `from` — the view the player was looking at before the
 * zoom changed — to `to`, zooming and panning together, so it moves from
 * wherever it was rather than snapping to the new width at a scroll offset
 * that meant something else at the old one and travelling on from there.
 */
function glide(surface: Surface, from: ZoomView, to: ZoomView, landed?: () => void): Glide {
    const paneSize = { x: surface.pane.clientWidth, y: surface.pane.clientHeight };
    const frameAt = (t: number) => {
        const frame = glideFrame(from, to, paneSize, t);
        return { offset: frame.offset, scale: frame.zoom / to.zoom };
    };
    const draw = (t: number) => {
        const frame = frameAt(t);
        surface.drawAt(frame.offset, frame.scale);
    };
    // Placed on its first frame before the new width is seen.
    const opening = frameAt(0);
    surface.liftOff(opening.offset, opening.scale);
    let frame = 0;
    let done = false;
    // Told once, however the glide ends: at its lead, or as it's cut short.
    let told = false;
    const tell = () => {
        if (told) return;
        told = true;
        landed?.();
    };
    const settle = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(frame);
        surface.landAt(to.scroll);
        tell();
    };
    const started = performance.now();
    const step = (now: number) => {
        const t = (now - started) / GLIDE_MS;
        if (t >= 1) { settle(); return; }
        draw(easeInOut(t));
        if (t >= GLIDE_LEAD) tell();
        frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return { settle, settled: () => done };
}

/** Bring a focus into view on a board already laid out at its zoom: a glide when it's smooth, otherwise (the pill, or reduced motion) it simply lands. */
function showFocus(surface: Surface, target: FocusTarget, zoom: number): Glide | null {
    const to = focusView(surface.pane, target, zoom);
    if (target.smooth && target.from) return glide(surface, target.from, to, target.landed);
    surface.landAt(to.scroll);
    target.landed?.();
    return null;
}

/**
 * Where in the board a zoom should leave the player: a point on the content as
 * a fraction of its size, and where under the pane that point should stay put.
 * Recorded before the zoom changes and applied once the new width has laid out.
 */
interface ZoomAnchor { cx: number; cy: number; vx: number; vy: number }

/** The content point under (vx, vy) in the pane, as a fraction of the board. */
function anchorAt(pane: HTMLDivElement, vx: number, vy: number): ZoomAnchor {
    return {
        cx: (pane.scrollLeft + vx) / (pane.scrollWidth || 1),
        cy: (pane.scrollTop + vy) / (pane.scrollHeight || 1),
        vx,
        vy,
    };
}

/** Where a focus rect sits in the child SVG, as a fraction of its viewBox — what both the unprompted auto-focus and a manual zoom tap centre on. */
function focusCentre(rect: Rect, viewBox: { width: number; height: number }): { cx: number; cy: number } {
    return {
        cx: (rect.x + rect.width / 2) / viewBox.width,
        cy: (rect.y + rect.height / 2) / viewBox.height,
    };
}

/**
 * What a board calls to keep a point in the middle of the pane, or null once
 * it has stopped following anything. It is the same function for the life of
 * the `BoardZoom` that provides it, so a board's clock can hold it without
 * resubscribing.
 */
type BoardCentre = (point: { x: number; y: number } | null) => void;

/**
 * The board following a point a frame at a time (`useBoardCentre`). Like a
 * glide, it is drawn as a transform over the pane unscrolled — sub-pixel, and
 * on a layer of its own, so a frame moves what's already drawn rather than
 * scrolling the pane a whole pixel at a time and repainting it — and handed back
 * to the pane's scroll once it lets go. `content` is the board's laid-out size
 * as it lifted off, which the transform mustn't be measured into.
 */
type Track = Pick<ZoomView, 'content' | 'scroll'>;

const BoardCentreContext = createContext<BoardCentre | null>(null);

/**
 * The fourth way a board's view moves, and the only one the board drives: a
 * board keeping something moving in the middle of the frame — Realm Arena
 * following a walker across the board — calls the function this returns each
 * frame, from its own clock, with the point (in the child SVG's viewBox units)
 * that should be there, and with null once it's done. The board is moved to it
 * at once, at the zoom it is already at (`Track`); nothing here runs a loop of
 * its own. It does nothing while a
 * focus glide is still on its way, during a pinch, or once the player has taken
 * hold of the board — a touch, a wheel or the zoom pill — since the focus
 * began: a player who grabs the board mid-walk keeps it, until the next focus.
 * `null` outside a `BoardZoom`.
 */
export function useBoardCentre(): BoardCentre | null {
    return useContext(BoardCentreContext);
}

function spread(touches: TouchList): number {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

/** The fingers' midpoint, relative to the pane's top-left corner. */
function midpoint(touches: TouchList, pane: HTMLDivElement): { x: number; y: number } {
    const rect = pane.getBoundingClientRect();
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
        y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
    };
}

/**
 * A pinch in progress. Nothing about it goes through React until the fingers
 * lift: every frame between is a CSS transform on the board, which is what
 * lets it keep up with the fingers on a board of a few hundred SVG nodes.
 */
interface Pinch {
    /**
     * The baseline the current pair of fingers is measured from: their spread
     * and midpoint, and the board's scroll position, size and zoom as drawn
     * when they took hold. Re-taken whenever the pair changes mid-gesture (a
     * third finger comes and goes), so the new pair carries on from wherever
     * the old one left the board rather than from where the pinch began.
     */
    spread: number;
    start: { x: number; y: number };
    scroll: { x: number; y: number };
    content: { x: number; y: number };
    zoom: number;
    /** The pane's size, which a pinch never changes. */
    pane: { x: number; y: number };
    /** The zoom actually laid out, which the transform scales from. */
    laidOut: number;
    /** Where the latest frame left it: the zoom drawn, and the board's offset in the pane. */
    drawn: number;
    offset: { x: number; y: number };
}

/** Where a pinch's latest frame has drawn the board. */
function pinchView(pinch: Pinch): ZoomView {
    return { zoom: pinch.drawn, ...drawnView(pinch.content, pinch.offset, pinch.drawn / pinch.zoom) };
}

/** Re-take a pinch's baseline from the fingers now down, keeping the board where it's drawn. */
function rebase(pinch: Pinch, touches: TouchList, pane: HTMLDivElement) {
    Object.assign(pinch, pinchView(pinch));
    pinch.spread = spread(touches);
    pinch.start = midpoint(touches, pane);
}

/** Calls `measure` now, and again whenever the pane or the board's wrapper changes size. Returns what stops it. */
function watchSize(pane: HTMLDivElement, content: HTMLDivElement, measure: () => void): () => void {
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    observer.observe(content);
    return () => observer.disconnect();
}

/**
 * Zoom control + scroll pane for a board that's wider than the app column.
 * Fitted to the column the map is readable but the tap targets are tiny, so
 * this pins a pill in the corner of the frame that blows the board up and lets
 * the player pan around it instead. Render it inside an `.ag-board-frame`.
 *
 * The frame never changes size: zooming happens inside it. It holds the height
 * the board has fitted to the column, and a zoomed board scrolls within it
 * both ways, so the page around the board stays exactly where it was.
 *
 * Zoom moves two ways, because the two habits are different: the pill steps
 * through fit → in → more → fit, and a pinch (or a trackpad's ctrl-wheel) sets
 * anything in between. A pinch follows the fingers — the spot on the board
 * that was under them stays under them as they spread, and travels with them
 * as they move — so it handles like a photo does rather than zooming about
 * some point of its own. The pill keeps the middle of the frame where it was,
 * unless a `focus` is live: then there is already a "the part of the board
 * that matters" — the roll just landed, the car just moved — so the pill steps
 * in on that instead. Panning is the pane's own scrolling; nothing here
 * reimplements a drag.
 *
 * A third way a board's view moves is `focus`: unprompted, the instant a
 * roll (or whatever the board calls "something just happened here") hands it
 * a region to show. That one is a glide rather than a jump — zooming and
 * panning together, starting from wherever the board already is, since the
 * player didn't ask for it and it should read as the board following the
 * action rather than teleporting the ground from under them — and it goes looking
 * for its own zoom level rather than reusing whatever step the player was
 * last on, since the point is tap targets big enough for what just became
 * choosable.
 *
 * And a board can be redrawn under the player without anything happening on
 * it — Realm Arena's battlefield turned a quarter — which hands this a
 * `pivot`, so whatever was in the middle of the frame is still there after.
 * The fourth is the board's own, frame by frame: `useBoardCentre`.
 *
 * A board that is a camera rather than a layout — a WebGL canvas, too big to be
 * made 600% of the column wide — wears all of this in `camera` mode. Nothing
 * else changes: the same steps, the same pinch under the fingers, the same
 * glide, pivot and follow, all in the viewBox's units. Only where the board
 * goes differs. It is never laid out at the zoomed size or transformed: an
 * empty spacer of that size is what scrolls, and the child is pinned to the
 * pane, told what part of the board is in it (`useBoardView`) however that
 * came about, and draws exactly that.
 */
export default function BoardZoom({ zoomWidth, maxWidth, viewBox, focus, onFocused, pivot, camera = false, children }: BoardZoomProps) {
    const levels = useMemo(() => zoomLevels(zoomWidth, maxWidth), [zoomWidth, maxWidth]);
    const max = levels[levels.length - 1];

    const [zoom, setZoom] = useState(FIT_WIDTH);
    // The height the board comes to when fitted to the column — what the
    // frame holds on to once it's zoomed, so the page doesn't grow with it.
    const [fitHeight, setFitHeight] = useState<number | null>(null);
    const paneRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    // Whether it's a camera is fixed for the component's life: a camera is told
    // where the view is (`useBoardView`) rather than the board being transformed.
    const [feed] = useState(() => camera ? new ViewFeed() : null);
    const surfaceRef = useRef<Surface | null>(null);
    const zoomRef = useRef(FIT_WIDTH);
    const anchorRef = useRef<ZoomAnchor | null>(null);
    const scrollToRef = useRef<{ x: number; y: number } | null>(null);
    const pinchRef = useRef<Pinch | null>(null);
    const focusTargetRef = useRef<FocusTarget | null>(null);
    const glideRef = useRef<Glide | null>(null);
    const trackRef = useRef<Track | null>(null);
    // Whether the player has touched, wheeled or stepped the board since the
    // latest focus began, which stops `useBoardCentre` until the next one.
    const takenRef = useRef(false);
    const viewBoxRef = useRef(viewBox);
    useEffect(() => {
        viewBoxRef.current = viewBox;
    });
    // What the board is drawn on, once the pane has mounted.
    const surfaceOf = useCallback((): Surface | null => {
        const pane = paneRef.current, content = contentRef.current;
        if (!surfaceRef.current && pane && content) surfaceRef.current = feed ? cameraSurface(pane, feed) : transformSurface(pane, content);
        return surfaceRef.current;
    }, [feed]);
    // Read when a glide lands rather than when it starts: boards pass it inline.
    const onFocusedRef = useRef(onFocused);
    useEffect(() => {
        onFocusedRef.current = onFocused;
    });

    // Put the recorded point back under the finger (or back in the middle) once
    // the new width has laid out — before paint, so the board never flashes at
    // the wrong scroll offset. A pending `focus` takes priority over a gesture
    // anchor — the two can never both be live, since nothing sets one while the
    // other is pending, but a focus reads as a deliberate "look here" and a
    // leftover anchor from an earlier pinch never should be. A finished pinch
    // hands over its transform here too, in the same frame the new width lands
    // (`scrollToRef`, which likewise is only ever set with nothing else
    // pending). And a zoom that lands while fingers are still down — the pill,
    // or a focus arriving mid-gesture — ends that pinch here: the board it was
    // transforming has just been laid out afresh underneath it. (Everything
    // that changes the zoom settles a glide in flight first, so none is left
    // to settle here.)
    useLayoutEffect(() => {
        zoomRef.current = zoom;
        pinchRef.current = null;
        const surface = surfaceOf();
        if (!surface) return;
        const { pane } = surface;
        const anchor = anchorRef.current;
        anchorRef.current = null;
        const scrollTo = scrollToRef.current;
        scrollToRef.current = null;
        surface.release();
        const focusTarget = focusTargetRef.current;
        if (focusTarget) {
            focusTargetRef.current = null;
            glideRef.current = showFocus(surface, focusTarget, zoom);
            return;
        }
        if (scrollTo) {
            surface.landAt(scrollTo);
            return;
        }
        if (anchor) {
            pane.scrollLeft = anchor.cx * pane.scrollWidth - anchor.vx;
            pane.scrollTop = anchor.cy * pane.scrollHeight - anchor.vy;
        }
        // The board has the width the pane was given, wherever it's scrolled to.
        surface.scrolled();
    }, [zoom, surfaceOf]);

    // The fitted height follows the column's width and the board's own shape,
    // so it's remeasured whenever either might have changed. The board's
    // proportions are the same at every zoom, which is what lets this measure
    // it at whatever zoom (or mid-pinch scale) it happens to be at.
    // The board is looked up afresh each time, and its wrapper watched rather
    // than the board itself, so a board that renders after BoardZoom mounts
    // (or is swapped for another) is still measured.
    useEffect(() => {
        const pane = paneRef.current;
        const content = contentRef.current;
        if (feed || !pane || !content) return;
        return watchSize(pane, content, () => {
            const box = content.querySelector('svg')?.getBoundingClientRect();
            if (box && box.width > 0) setFitHeight(pane.clientWidth * box.height / box.width);
        });
    }, [feed]);

    // A camera board has no `<svg>` to measure, so its fitted height is its
    // viewBox's shape at the column's width, and the box it draws into is given
    // the pane's size in pixels (ag-theme.css `.ag-board-zoom-slot`) — before
    // paint, so it never shows unsized. Whatever the pane or the board's width
    // changes, the camera is told the view again; so it is as it mounts, and as
    // the pane scrolls. (A layout effect, unlike the measuring above, which a
    // browser's board has no need to hurry.)
    const viewBoxWidth = viewBox?.width, viewBoxHeight = viewBox?.height;
    useLayoutEffect(() => {
        const pane = paneRef.current;
        const content = contentRef.current;
        if (!feed || !pane || !content) return;
        const size = viewBoxWidth && viewBoxHeight ? { width: viewBoxWidth, height: viewBoxHeight } : undefined;
        feed.bind(pane, content, size);
        const stopWatching = watchSize(pane, content, () => {
            pane.style.setProperty('--ag-board-pane-w', `${pane.clientWidth}px`);
            pane.style.setProperty('--ag-board-pane-h', `${pane.clientHeight}px`);
            if (size) setFitHeight(pane.clientWidth * size.height / size.width);
            feed.moved();
        });
        feed.sync();
        const onScroll = () => feed.moved();
        pane.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            stopWatching();
            pane.removeEventListener('scroll', onScroll);
        };
    }, [feed, viewBoxWidth, viewBoxHeight]);

    // A follow lands where it got to, the pane scrolled there.
    const landTrack = useCallback(() => {
        const surface = surfaceOf(), track = trackRef.current;
        trackRef.current = null;
        if (surface && track) surface.landAt(track.scroll);
    }, [surfaceOf]);
    // Whatever else moves the view first ends a glide where it was heading, and
    // a follow where it got to, so it starts from a board as it's laid out.
    const letGo = useCallback(() => {
        glideRef.current?.settle();
        landTrack();
    }, [landTrack]);
    // Keeping a point in the middle is only for a view that is nobody's but the
    // board's: no glide on its way (nor one about to start, its zoom still
    // laying out), no pinch, and no player's hand on it. One function for the
    // component's life, so a board's clock holds it without resubscribing.
    const centre = useCallback<BoardCentre>(point => {
        const surface = surfaceOf();
        const size = viewBoxRef.current;
        if (!point) { landTrack(); return; }
        if (!surface || !size || takenRef.current || pinchRef.current || focusTargetRef.current) return;
        if (glideRef.current && !glideRef.current.settled()) return;
        const { pane } = surface;
        // Measured before it lifts off: a transform can count towards what the pane scrolls over.
        const lifted = trackRef.current?.content;
        const board = lifted ?? { x: pane.scrollWidth, y: pane.scrollHeight };
        const scroll = centredScroll(point, size, board, { x: pane.clientWidth, y: pane.clientHeight });
        trackRef.current = { content: board, scroll };
        if (lifted) surface.drawAt({ x: -scroll.x, y: -scroll.y }, 1);
        else surface.liftOff({ x: -scroll.x, y: -scroll.y });
    }, [landTrack, surfaceOf]);

    // A glide still in flight as the board goes away has nothing left to draw on.
    useEffect(() => () => letGo(), [letGo]);

    // The auto-focus itself: pick the deepest zoom step the region still fits
    // at (or, for an `exact` focus, the zoom that just fits it), then glide
    // to it from the view the board is in right now — a pinch's latest frame
    // included — so the zoom starts from wherever the player was looking.
    // When the board is already at that zoom, changing `zoom` to the same
    // value is a no-op React won't re-render for, so the glide starts right
    // here instead of waiting on the layout effect above.
    useEffect(() => {
        const surface = surfaceOf();
        if (!surface || !focus || !viewBox) return;
        const { pane } = surface;
        letGo();
        takenRef.current = false;
        const inset = focus.inset ?? 0;
        const level = focus.exact
            ? exactZoom(focus.rect, viewBox, { width: pane.clientWidth, height: pane.clientHeight }, FOCUS_MARGIN_PX, max, inset)
            : focusZoom(levels, focus.rect.width, viewBox.width, pane.clientWidth, FOCUS_MARGIN_PX);
        const { key } = focus;
        const target: FocusTarget = {
            ...focusCentre(focus.rect, viewBox),
            inset,
            smooth: !prefersReducedMotion(),
            from: currentView(pane, zoom, pinchRef.current),
            landed: () => onFocusedRef.current?.(key),
        };
        if (level === zoom) {
            // Fingers still down would otherwise go on drawing over a pane
            // that has just scrolled out from under them.
            pinchRef.current = null;
            surface.release();
            glideRef.current = showFocus(surface, target, zoom);
        } else {
            focusTargetRef.current = target;
            setZoom(level);
        }
        // Only `focus.key` should retrigger this — `zoom` and `levels` are read
        // for their current value, not watched, and `focus.rect`/`viewBox` are
        // fresh every render whether or not the key changed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focus?.key]);

    // A pivot lands at once, before paint, rather than gliding: the board has
    // already moved under the player, and this only puts their place back.
    useLayoutEffect(() => {
        const surface = surfaceOf();
        if (!surface || !pivot || !viewBox) return;
        const { pane } = surface;
        letGo();
        // Read as it's drawn: mid-pinch, the pane sits unscrolled under the transform.
        const view = currentView(pane, zoomRef.current, pinchRef.current);
        pinchRef.current = null;
        surface.release();
        const middle = { x: pane.clientWidth / 2, y: pane.clientHeight / 2 };
        const to = pivot.at({
            x: (view.scroll.x + middle.x) / view.content.x * viewBox.width,
            y: (view.scroll.y + middle.y) / view.content.y * viewBox.height,
        });
        const scroll = centredScroll(to, viewBox, { x: pane.scrollWidth, y: pane.scrollHeight }, { x: pane.clientWidth, y: pane.clientHeight });
        pane.scrollLeft = scroll.x;
        pane.scrollTop = scroll.y;
        surface.scrolled();
        // Only `pivot.key` should retrigger this, as with `focus.key` above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pivot?.key]);

    const next = levels.find(level => level > zoom + 1) ?? FIT_WIDTH;
    const stepZoom = () => {
        const pane = paneRef.current;
        if (!pane) { setZoom(next); return; }
        takenRef.current = true;
        letGo();
        // A live focus is what the player is looking at right now — the pill
        // should zoom in on that, not on wherever they last panned to. Instant
        // rather than the auto-focus's smooth scroll: this jump is the one the
        // player just asked for by tapping, not an unprompted one to soften.
        if (focus && viewBox) {
            focusTargetRef.current = { ...focusCentre(focus.rect, viewBox), inset: focus.inset ?? 0, smooth: false };
        } else {
            anchorRef.current = anchorAt(pane, pane.clientWidth / 2, pane.clientHeight / 2);
        }
        setZoom(next);
    };

    useEffect(() => {
        const surface = surfaceOf();
        if (!surface || levels.length === 1) return;
        const { pane } = surface;
        const clamp = (value: number) => Math.min(max, Math.max(FIT_WIDTH, value));

        const onTouchStart = (event: TouchEvent) => {
            // A finger on the board ends a glide where it was heading, so a
            // pan or a pinch starts from the board as it's laid out.
            takenRef.current = true;
            letGo();
            if (event.touches.length !== 2 || pinchRef.current) return;
            const start = midpoint(event.touches, pane);
            const scroll = { x: pane.scrollLeft, y: pane.scrollTop };
            pinchRef.current = {
                spread: spread(event.touches),
                start,
                scroll,
                content: { x: pane.scrollWidth, y: pane.scrollHeight },
                zoom: zoomRef.current,
                pane: { x: pane.clientWidth, y: pane.clientHeight },
                laidOut: zoomRef.current,
                drawn: zoomRef.current,
                offset: { x: -scroll.x, y: -scroll.y },
            };
            surface.liftOff({ x: -scroll.x, y: -scroll.y });
        };

        const onTouchMove = (event: TouchEvent) => {
            const pinch = pinchRef.current;
            if (!pinch) return;
            // Non-passive on purpose: without this the browser zooms the page
            // (or scrolls the pane under the transform) instead, and React's
            // own onTouchMove can't refuse it. Refused with a third finger down
            // too — the board just holds still until it's back to a pair.
            event.preventDefault();
            if (event.touches.length !== 2) return;
            const gap = spread(event.touches);
            if (gap === 0 || pinch.spread === 0) return;
            const scale = clamp(pinch.zoom * gap / pinch.spread) / pinch.zoom;
            const finger = midpoint(event.touches, pane);
            pinch.drawn = pinch.zoom * scale;
            pinch.offset = {
                x: pinchOffset(pinch.scroll.x, pinch.start.x, finger.x, scale, pinch.content.x, pinch.pane.x),
                y: pinchOffset(pinch.scroll.y, pinch.start.y, finger.y, scale, pinch.content.y, pinch.pane.y),
            };
            surface.drawAt(pinch.offset, pinch.drawn / pinch.laidOut);
        };

        // The fingers lifting is when the zoom actually changes: the board is
        // laid out at its new width and scrolled to exactly where the
        // transform had drawn it, in the one frame, so nothing visibly moves.
        const endPinch = (event: TouchEvent) => {
            const pinch = pinchRef.current;
            if (!pinch) return;
            // A finger lifting with two still down (a third had joined) isn't
            // the end: the pair left carries on from where the board is drawn.
            if (event.touches.length >= 2) {
                if (event.touches.length === 2) rebase(pinch, event.touches, pane);
                return;
            }
            pinchRef.current = null;
            const scrollTo = { x: -pinch.offset.x, y: -pinch.offset.y };
            const nextZoom = pinch.drawn;
            if (nextZoom === zoomRef.current) {
                surface.landAt(scrollTo);
                return;
            }
            scrollToRef.current = scrollTo;
            setZoom(nextZoom);
        };

        // A trackpad's pinch arrives as a wheel with ctrl held; so does a
        // browser's own keyboard zoom over the pane, and taking that one is the
        // lesser evil next to the board jumping a level per notch.
        const onWheel = (event: WheelEvent) => {
            takenRef.current = true;
            letGo();
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            if (pinchRef.current) return;
            const rect = pane.getBoundingClientRect();
            anchorRef.current = anchorAt(pane, event.clientX - rect.left, event.clientY - rect.top);
            setZoom(zoomLevel => clamp(zoomLevel * wheelZoomFactor(event.deltaY, event.deltaMode)));
        };

        pane.addEventListener('touchstart', onTouchStart, { passive: true });
        pane.addEventListener('touchmove', onTouchMove, { passive: false });
        pane.addEventListener('touchend', endPinch, { passive: true });
        pane.addEventListener('touchcancel', endPinch, { passive: true });
        pane.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            pane.removeEventListener('touchstart', onTouchStart);
            pane.removeEventListener('touchmove', onTouchMove);
            pane.removeEventListener('touchend', endPinch);
            pane.removeEventListener('touchcancel', endPinch);
            pane.removeEventListener('wheel', onWheel);
        };
    }, [levels.length, max, letGo, surfaceOf]);

    return (
        <>
            {/* A stepper, not a toggle, so the label is the whole story: it
                names what the next press does and there is no `aria-pressed`
                that would read the same for two different zoom levels. */}
            {levels.length > 1 && (
                <button type="button" className="ag-board-tag ag-board-tag--action" onClick={stepZoom}>
                    {next === FIT_WIDTH ? '➖ Fit map' : next === levels[1] ? '➕ Zoom in' : '➕ Zoom more'}
                </button>
            )}
            <div
                ref={paneRef}
                className="ag-board-scroll"
                data-perf-region="board"
                style={{
                    '--ag-board-zoom': `${zoom}%`,
                    // Fitted, the board is its own height; zoomed, the frame
                    // keeps that height and the board scrolls inside it.
                    height: zoom > FIT_WIDTH && fitHeight ? fitHeight : undefined,
                } as React.CSSProperties}
            >
                <div ref={contentRef} className={feed ? 'ag-board-zoom-content ag-board-zoom-content--camera' : 'ag-board-zoom-content'}>
                    <BoardViewContext.Provider value={feed}>
                        <BoardCentreContext.Provider value={centre}>
                            {feed && viewBox ? (
                                <>
                                    {/* Scrolled over in the board's place, the shape of its viewBox at the zoom. */}
                                    <div className="ag-board-zoom-spacer" style={{ aspectRatio: `${viewBox.width} / ${viewBox.height}` }} aria-hidden="true" />
                                    <div className="ag-board-zoom-slot" data-perf-region="camera">{children}</div>
                                </>
                            ) : children}
                        </BoardCentreContext.Provider>
                    </BoardViewContext.Provider>
                </div>
            </div>
        </>
    );
}
