'use client'
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FIT_WIDTH, focusZoom, wheelZoomFactor, zoomLevels } from '@/utils/ui/boardZoom';
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
    const left = target.cx * pane.scrollWidth - pane.clientWidth / 2;
    pane.scrollTo({
        left: Math.min(Math.max(left, 0), Math.max(0, pane.scrollWidth - pane.clientWidth)),
        behavior: target.smooth ? 'smooth' : 'auto',
    });
    // The pane never clips vertically (its height follows its content's, so
    // there is nothing to scroll inside it — see ag-theme.css's note on
    // `.ag-board-scroll`); bringing a tall board's focus into view up-down is
    // the page's own scroll to make, not the pane's.
    const paneTop = pane.getBoundingClientRect().top + window.scrollY;
    const top = paneTop + target.cy * pane.scrollHeight - window.innerHeight / 2;
    window.scrollTo({ top: Math.max(0, top), behavior: target.smooth ? 'smooth' : 'auto' });
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

function spread(touches: TouchList): number {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

function midpoint(touches: TouchList): { x: number; y: number } {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
    };
}

/**
 * Zoom control + scroll pane for a board that's wider than the app column.
 * Fitted to the column the map is readable but the tap targets are tiny, so
 * this pins a pill in the corner of the frame that blows the board up and lets
 * the player pan around it instead. Render it inside an `.ag-board-frame`.
 *
 * Zoom moves two ways, because the two habits are different: the pill steps
 * through fit → in → more → fit, and a pinch (or a trackpad's ctrl-wheel) sets
 * anything in between. Both keep the part of the board the player was looking
 * at under the same spot on screen rather than snapping back to the corner —
 * on a big board that's the difference between zooming and getting lost.
 * Panning is the pane's own scrolling; nothing here reimplements a drag.
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
    const paneRef = useRef<HTMLDivElement>(null);
    const anchorRef = useRef<ZoomAnchor | null>(null);
    const pinchRef = useRef<{ spread: number; cx: number; cy: number } | null>(null);
    const focusTargetRef = useRef<FocusTarget | null>(null);

    // Put the recorded point back under the finger (or back in the middle) once
    // the new width has laid out — before paint, so the board never flashes at
    // the wrong scroll offset. A pending `focus` takes priority over a gesture
    // anchor — the two can never both be live, since nothing sets one while the
    // other is pending, but a focus reads as a deliberate "look here" and a
    // leftover anchor from an earlier pinch never should be.
    useLayoutEffect(() => {
        const pane = paneRef.current;
        if (!pane) return;
        const anchor = anchorRef.current;
        anchorRef.current = null;
        const focusTarget = focusTargetRef.current;
        if (focusTarget) {
            focusTargetRef.current = null;
            applyFocusTarget(pane, focusTarget);
            return;
        }
        if (!anchor) return;
        pane.scrollLeft = anchor.cx * pane.scrollWidth - anchor.vx;
        pane.scrollTop = anchor.cy * pane.scrollHeight - anchor.vy;
    }, [zoom]);

    // The auto-focus itself: pick the deepest zoom step the region still fits
    // at, then scroll to it. When the board is already at that step, changing
    // `zoom` to the same value is a no-op React won't re-render for, so the
    // scroll happens right here instead of waiting on the layout effect above.
    useEffect(() => {
        const pane = paneRef.current;
        if (!pane || !focus || !viewBox) return;
        const level = focusZoom(levels, focus.rect.width, viewBox.width, pane.clientWidth, FOCUS_MARGIN_PX);
        const target: FocusTarget = {
            cx: (focus.rect.x + focus.rect.width / 2) / viewBox.width,
            cy: (focus.rect.y + focus.rect.height / 2) / viewBox.height,
            smooth: !prefersReducedMotion(),
        };
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
        if (pane) anchorRef.current = anchorAt(pane, pane.clientWidth / 2, pane.clientHeight / 2);
        setZoom(next);
    };

    useEffect(() => {
        const pane = paneRef.current;
        if (!pane || levels.length === 1) return;
        const clamp = (value: number) => Math.min(max, Math.max(FIT_WIDTH, value));

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 2) return;
            const rect = pane.getBoundingClientRect();
            const mid = midpoint(event.touches);
            const at = anchorAt(pane, mid.x - rect.left, mid.y - rect.top);
            pinchRef.current = { spread: spread(event.touches), cx: at.cx, cy: at.cy };
        };

        // Each frame moves the zoom by how far the fingers moved since the last
        // one, so nothing here has to know what the zoom was when the pinch
        // began — no mirror of the state to keep in step with it.
        const onTouchMove = (event: TouchEvent) => {
            const pinch = pinchRef.current;
            if (!pinch || event.touches.length !== 2) return;
            const gap = spread(event.touches);
            if (gap === 0 || pinch.spread === 0) return;
            // Non-passive on purpose: without this the browser zooms the page
            // instead, and React's own onTouchMove can't refuse it.
            event.preventDefault();
            const ratio = gap / pinch.spread;
            pinch.spread = gap;
            const rect = pane.getBoundingClientRect();
            const mid = midpoint(event.touches);
            // The content point stays the one the pinch started on, but it
            // follows the fingers, so a pinch pans as well as zooms.
            anchorRef.current = { cx: pinch.cx, cy: pinch.cy, vx: mid.x - rect.left, vy: mid.y - rect.top };
            setZoom(zoomLevel => clamp(zoomLevel * ratio));
        };

        const endPinch = () => { pinchRef.current = null; };

        // A trackpad's pinch arrives as a wheel with ctrl held; so does a
        // browser's own keyboard zoom over the pane, and taking that one is the
        // lesser evil next to the board jumping a level per notch.
        const onWheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
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
                style={{ '--ag-board-zoom': `${zoom}%` } as React.CSSProperties}
            >
                {children}
            </div>
        </>
    );
}
