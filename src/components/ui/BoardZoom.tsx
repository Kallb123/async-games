'use client'
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FIT_WIDTH, focusZoom, pinchOffset, wheelZoomFactor, zoomLevels } from '@/utils/ui/boardZoom';
import { prefersReducedMotion } from '@/utils/hooks/usePrefersReducedMotion';
import type { Rect } from '@/utils/ui/mapLabels';

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
    /** The board <svg>. */
    children: React.ReactNode;
}

/** How much breathing room a focused region keeps from the edge of the pane. */
const FOCUS_MARGIN_PX = 28;

/** The content point a focus should centre, as a fraction of the whole board. */
interface FocusTarget { cx: number; cy: number; smooth: boolean }

function applyFocusTarget(pane: HTMLDivElement, target: FocusTarget) {
    const behavior = target.smooth ? 'smooth' : 'auto';
    const clampScroll = (value: number, content: number, view: number) => Math.min(Math.max(value, 0), Math.max(0, content - view));
    const left = clampScroll(target.cx * pane.scrollWidth - pane.clientWidth / 2, pane.scrollWidth, pane.clientWidth);
    const top = clampScroll(target.cy * pane.scrollHeight - pane.clientHeight / 2, pane.scrollHeight, pane.clientHeight);
    pane.scrollTo({ left, top, behavior });
    // The frame keeps its fitted height, so it can itself be taller than the
    // screen (a long circuit fitted to a phone's width). Where the focus would
    // still land off-screen once the pane has scrolled, the page moves too —
    // but only then: a board already in view shouldn't drag the page about.
    const pointY = pane.getBoundingClientRect().top + target.cy * pane.scrollHeight - top;
    if (pointY < FOCUS_MARGIN_PX || pointY > window.innerHeight - FOCUS_MARGIN_PX) {
        window.scrollTo({ top: Math.max(0, window.scrollY + pointY - window.innerHeight / 2), behavior });
    }
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
    /** Finger spread, midpoint and scroll position when the pinch began. */
    spread: number;
    start: { x: number; y: number };
    scroll: { x: number; y: number };
    /** The board's size, the pane's, and the zoom they were at, when it began. */
    content: { x: number; y: number };
    pane: { x: number; y: number };
    zoom: number;
    /** Where the latest frame left it: its scale over `zoom`, and the board's offset in the pane. */
    scale: number;
    offset: { x: number; y: number };
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
 * a region to show. That one is a smooth scroll rather than a jump — the
 * player didn't ask for it, so it reads as the board following the action
 * rather than teleporting the ground from under them — and it goes looking
 * for its own zoom level rather than reusing whatever step the player was
 * last on, since the point is tap targets big enough for what just became
 * choosable.
 */
export default function BoardZoom({ zoomWidth, maxWidth, viewBox, focus, children }: BoardZoomProps) {
    const levels = useMemo(() => zoomLevels(zoomWidth, maxWidth), [zoomWidth, maxWidth]);
    const max = levels[levels.length - 1];

    const [zoom, setZoom] = useState(FIT_WIDTH);
    // The height the board comes to when fitted to the column — what the
    // frame holds on to once it's zoomed, so the page doesn't grow with it.
    const [fitHeight, setFitHeight] = useState<number | null>(null);
    const paneRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef(FIT_WIDTH);
    const anchorRef = useRef<ZoomAnchor | null>(null);
    const scrollToRef = useRef<{ x: number; y: number } | null>(null);
    const pinchRef = useRef<Pinch | null>(null);
    const focusTargetRef = useRef<FocusTarget | null>(null);

    // Put the recorded point back under the finger (or back in the middle) once
    // the new width has laid out — before paint, so the board never flashes at
    // the wrong scroll offset. A pending `focus` takes priority over a gesture
    // anchor — the two can never both be live, since nothing sets one while the
    // other is pending, but a focus reads as a deliberate "look here" and a
    // leftover anchor from an earlier pinch never should be. A finished pinch
    // hands over its transform here too, in the same frame the new width lands.
    useLayoutEffect(() => {
        zoomRef.current = zoom;
        const pane = paneRef.current;
        if (!pane) return;
        const anchor = anchorRef.current;
        anchorRef.current = null;
        const scrollTo = scrollToRef.current;
        scrollToRef.current = null;
        if (contentRef.current) contentRef.current.style.transform = '';
        const focusTarget = focusTargetRef.current;
        if (focusTarget) {
            focusTargetRef.current = null;
            applyFocusTarget(pane, focusTarget);
            return;
        }
        if (scrollTo) {
            pane.scrollLeft = scrollTo.x;
            pane.scrollTop = scrollTo.y;
            return;
        }
        if (!anchor) return;
        pane.scrollLeft = anchor.cx * pane.scrollWidth - anchor.vx;
        pane.scrollTop = anchor.cy * pane.scrollHeight - anchor.vy;
    }, [zoom]);

    // The fitted height follows the column's width and the board's own shape,
    // so it's remeasured whenever either might have changed. The board's
    // proportions are the same at every zoom, which is what lets this measure
    // it at whatever zoom (or mid-pinch scale) it happens to be at.
    useEffect(() => {
        const pane = paneRef.current;
        const board = pane?.querySelector('svg');
        if (!pane || !board) return;
        const measure = () => {
            const box = board.getBoundingClientRect();
            if (box.width > 0) setFitHeight(pane.clientWidth * box.height / box.width);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(pane);
        observer.observe(board);
        return () => observer.disconnect();
    }, []);

    // The auto-focus itself: pick the deepest zoom step the region still fits
    // at, then scroll to it. When the board is already at that step, changing
    // `zoom` to the same value is a no-op React won't re-render for, so the
    // scroll happens right here instead of waiting on the layout effect above.
    useEffect(() => {
        const pane = paneRef.current;
        if (!pane || !focus || !viewBox) return;
        const level = focusZoom(levels, focus.rect.width, viewBox.width, pane.clientWidth, FOCUS_MARGIN_PX);
        const target: FocusTarget = { ...focusCentre(focus.rect, viewBox), smooth: !prefersReducedMotion() };
        if (level === zoom) {
            applyFocusTarget(pane, target);
        } else {
            focusTargetRef.current = target;
            setZoom(level);
        }
        // Only `focus.key` should retrigger this — `zoom` and `levels` are read
        // for their current value, not watched, and `focus.rect`/`viewBox` are
        // fresh every render whether or not the key changed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focus?.key]);

    const next = levels.find(level => level > zoom + 1) ?? FIT_WIDTH;
    const stepZoom = () => {
        const pane = paneRef.current;
        if (!pane) { setZoom(next); return; }
        // A live focus is what the player is looking at right now — the pill
        // should zoom in on that, not on wherever they last panned to. Instant
        // rather than the auto-focus's smooth scroll: this jump is the one the
        // player just asked for by tapping, not an unprompted one to soften.
        if (focus && viewBox) {
            focusTargetRef.current = { ...focusCentre(focus.rect, viewBox), smooth: false };
        } else {
            anchorRef.current = anchorAt(pane, pane.clientWidth / 2, pane.clientHeight / 2);
        }
        setZoom(next);
    };

    useEffect(() => {
        const pane = paneRef.current;
        const content = contentRef.current;
        if (!pane || !content || levels.length === 1) return;
        const clamp = (value: number) => Math.min(max, Math.max(FIT_WIDTH, value));

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 2 || pinchRef.current) return;
            const start = midpoint(event.touches, pane);
            const scroll = { x: pane.scrollLeft, y: pane.scrollTop };
            pinchRef.current = {
                spread: spread(event.touches),
                start,
                scroll,
                content: { x: pane.scrollWidth, y: pane.scrollHeight },
                pane: { x: pane.clientWidth, y: pane.clientHeight },
                zoom: zoomRef.current,
                scale: 1,
                offset: { x: -scroll.x, y: -scroll.y },
            };
            // For the length of the pinch the pane sits unscrolled and the
            // transform alone places the board. Left scrolled, a board scaled
            // down under the scroll position would have the browser clamp it —
            // and the board would lurch mid-gesture.
            pane.scrollLeft = 0;
            pane.scrollTop = 0;
            content.style.transform = `translate(${-scroll.x}px, ${-scroll.y}px)`;
        };

        const onTouchMove = (event: TouchEvent) => {
            const pinch = pinchRef.current;
            if (!pinch || event.touches.length !== 2) return;
            // Non-passive on purpose: without this the browser zooms the page
            // (or scrolls the pane under the transform) instead, and React's
            // own onTouchMove can't refuse it.
            event.preventDefault();
            const gap = spread(event.touches);
            if (gap === 0 || pinch.spread === 0) return;
            const scale = clamp(pinch.zoom * gap / pinch.spread) / pinch.zoom;
            const finger = midpoint(event.touches, pane);
            pinch.scale = scale;
            pinch.offset = {
                x: pinchOffset(pinch.scroll.x, pinch.start.x, finger.x, scale, pinch.content.x, pinch.pane.x),
                y: pinchOffset(pinch.scroll.y, pinch.start.y, finger.y, scale, pinch.content.y, pinch.pane.y),
            };
            content.style.transform = `translate(${pinch.offset.x}px, ${pinch.offset.y}px) scale(${scale})`;
        };

        // The fingers lifting is when the zoom actually changes: the board is
        // laid out at its new width and scrolled to exactly where the
        // transform had drawn it, in the one frame, so nothing visibly moves.
        const endPinch = () => {
            const pinch = pinchRef.current;
            if (!pinch) return;
            pinchRef.current = null;
            const scrollTo = { x: -pinch.offset.x, y: -pinch.offset.y };
            const nextZoom = pinch.zoom * pinch.scale;
            if (nextZoom === zoomRef.current) {
                content.style.transform = '';
                pane.scrollLeft = scrollTo.x;
                pane.scrollTop = scrollTo.y;
                return;
            }
            scrollToRef.current = scrollTo;
            setZoom(nextZoom);
        };

        // A trackpad's pinch arrives as a wheel with ctrl held; so does a
        // browser's own keyboard zoom over the pane, and taking that one is the
        // lesser evil next to the board jumping a level per notch.
        const onWheel = (event: WheelEvent) => {
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
    }, [levels.length, max]);

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
                style={{
                    '--ag-board-zoom': `${zoom}%`,
                    // Fitted, the board is its own height; zoomed, the frame
                    // keeps that height and the board scrolls inside it.
                    height: zoom > FIT_WIDTH && fitHeight ? fitHeight : undefined,
                } as React.CSSProperties}
            >
                <div ref={contentRef} className="ag-board-zoom-content">{children}</div>
            </div>
        </>
    );
}
