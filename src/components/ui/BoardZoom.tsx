'use client'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

interface BoardZoomProps {
    /** Width the board is stretched to at the first zoom step, e.g. '260%'. */
    zoomWidth: string;
    /**
     * Width of the second step, and the ceiling a pinch may reach. Defaults to
     * twice `zoomWidth`, which is as far as a node-and-edge map ever needs to
     * go; a board whose pieces are still tiny at that — Race Cars draws 214
     * spaces across a 78-row circuit — names its own.
     */
    maxWidth?: string;
    /** The board <svg>. */
    children: React.ReactNode;
}

/** The width the board is drawn at when it's fitted to the column. */
const FIT = 100;

/**
 * Where in the board a zoom should leave the player: a point on the content as
 * a fraction of its size, and where under the pane that point should stay put.
 * Recorded before the zoom changes and applied once the new width has laid out.
 */
interface ZoomAnchor { cx: number; cy: number; vx: number; vy: number }

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
 */
export default function BoardZoom({ zoomWidth, maxWidth, children }: BoardZoomProps) {
    const levels = useMemo(() => {
        const step = parseFloat(zoomWidth) || FIT;
        if (step <= FIT) return [FIT];
        const deep = Math.max(step, maxWidth ? parseFloat(maxWidth) || step * 2 : step * 2);
        return [FIT, step, deep];
    }, [zoomWidth, maxWidth]);
    const max = levels[levels.length - 1];

    const [zoom, setZoom] = useState(FIT);
    const paneRef = useRef<HTMLDivElement>(null);
    const anchorRef = useRef<ZoomAnchor | null>(null);
    const zoomRef = useRef(FIT);
    const pinchRef = useRef<{ spread: number; zoom: number; cx: number; cy: number } | null>(null);

    // The gesture handlers need the live zoom without being re-bound on every
    // pinch frame, so it is mirrored into a ref rather than closed over.
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);

    // Put the recorded point back under the finger (or back in the middle) once
    // the new width has laid out — before paint, so the board never flashes at
    // the wrong scroll offset.
    useLayoutEffect(() => {
        const pane = paneRef.current;
        const anchor = anchorRef.current;
        if (!pane || !anchor) return;
        pane.scrollLeft = anchor.cx * pane.scrollWidth - anchor.vx;
        pane.scrollTop = anchor.cy * pane.scrollHeight - anchor.vy;
    }, [zoom]);

    /** The content point under (vx, vy) in the pane, as a fraction of the board. */
    const anchorAt = useCallback((pane: HTMLDivElement, vx: number, vy: number): ZoomAnchor => ({
        cx: (pane.scrollLeft + vx) / (pane.scrollWidth || 1),
        cy: (pane.scrollTop + vy) / (pane.scrollHeight || 1),
        vx,
        vy,
    }), []);

    const next = levels.find(level => level > zoom + 1) ?? FIT;
    const stepZoom = () => {
        const pane = paneRef.current;
        if (pane) anchorRef.current = anchorAt(pane, pane.clientWidth / 2, pane.clientHeight / 2);
        setZoom(next);
    };

    useEffect(() => {
        const pane = paneRef.current;
        if (!pane || levels.length === 1) return;
        const clamp = (value: number) => Math.min(max, Math.max(FIT, value));

        const onTouchStart = (event: TouchEvent) => {
            if (event.touches.length !== 2) return;
            const rect = pane.getBoundingClientRect();
            const mid = midpoint(event.touches);
            const at = anchorAt(pane, mid.x - rect.left, mid.y - rect.top);
            pinchRef.current = { spread: spread(event.touches), zoom: zoomRef.current, cx: at.cx, cy: at.cy };
        };

        const onTouchMove = (event: TouchEvent) => {
            const pinch = pinchRef.current;
            if (!pinch || event.touches.length !== 2 || pinch.spread === 0) return;
            // Non-passive on purpose: without this the browser zooms the page
            // instead, and React's own onTouchMove can't refuse it.
            event.preventDefault();
            const rect = pane.getBoundingClientRect();
            const mid = midpoint(event.touches);
            // The content point stays the one the pinch started on, but it
            // follows the fingers, so a pinch pans as well as zooms.
            anchorRef.current = { cx: pinch.cx, cy: pinch.cy, vx: mid.x - rect.left, vy: mid.y - rect.top };
            setZoom(clamp(pinch.zoom * spread(event.touches) / pinch.spread));
        };

        const endPinch = () => { pinchRef.current = null; };

        // A trackpad's pinch arrives as a wheel with ctrl held; so does a
        // browser's own keyboard zoom over the pane, and taking that one is the
        // lesser evil next to the board jumping a level per notch. `deltaMode`
        // has to be read: a wheel that reports lines or pages sends single
        // digits where a trackpad sends hundreds, and untranslated it would
        // move the board by a fraction of a percent per notch.
        const DELTA_TO_PIXELS = [1, 16, 100];
        const onWheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            const rect = pane.getBoundingClientRect();
            anchorRef.current = anchorAt(pane, event.clientX - rect.left, event.clientY - rect.top);
            const delta = event.deltaY * (DELTA_TO_PIXELS[event.deltaMode] ?? 1);
            setZoom(zoomLevel => clamp(zoomLevel * Math.exp(-delta / 220)));
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
    }, [anchorAt, levels.length, max]);

    return (
        <>
            {levels.length > 1 && (
                <button
                    type="button"
                    className="ag-board-tag ag-board-tag--action"
                    aria-pressed={zoom > FIT}
                    onClick={stepZoom}
                >
                    {next === FIT ? '➖ Fit map' : next === levels[1] ? '➕ Zoom in' : '➕ Zoom more'}
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
