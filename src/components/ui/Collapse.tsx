'use client'

import { ReactNode, useLayoutEffect, useRef } from "react";

/** Growing in from nothing, or shrinking away to nothing. */
export type CollapsePhase = "enter" | "exit";

/** Must match `--ag-anim-ms` in `ag-theme.css`. */
export const ANIM_MS = 300;

/** Set while `Collapse` is driving its own height — see `handover` below. */
const RESIZE_CLASS = "ag-anim-item--resize";

interface CollapseProps {
    phase?: CollapsePhase;
    /**
     * The height the content this has replaced was standing at.
     *
     * A hand-over — a placeholder row becoming the real row — swaps content of
     * one size for content of another in a single step, deliberately without
     * animating it. When the two are not the same height that single step
     * snaps, shunting everything below it up or down the page. Given the old
     * height, the box starts there instead and transitions to whatever the new
     * content needs.
     */
    from?: number;
    /**
     * Called with this box's height after every render, so whoever replaces
     * its content can hand that height back as `from`.
     */
    onMeasure?: (height: number) => void;
    children: ReactNode;
}

/**
 * A box that animates between its natural height and nothing — and, on a
 * hand-over, between one natural height and another.
 *
 * The grid-rows trick behind `.ag-anim-item` in `ag-theme.css` needs two nested
 * elements, so they live here once rather than at each call site.
 * `useAnimatedList` wraps every row in one; `ListSection` wraps its whole
 * section in another, so a section that runs out of rows takes its heading and
 * padding down with them instead of blinking out from under the page.
 */
export default function Collapse({ phase, from, onMeasure, children }: CollapseProps) {
    const box = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (onMeasure && box.current) onMeasure(box.current.offsetHeight);
    });

    // Layout effects run before the browser paints, so putting the box back to
    // the height it had and transitioning from there happens without the new
    // height ever being shown. Grid tracks can't do this — `0fr` interpolates
    // against `1fr`, a pixel height doesn't — so the hand-over drives `height`
    // instead, which only transitions while `RESIZE_CLASS` gives it a duration.
    useLayoutEffect(() => {
        const el = box.current;
        if (!el || !from) return;
        const to = el.offsetHeight;
        if (to === from) return;
        el.style.height = `${from}px`;
        void el.offsetHeight; // fixes that as the height to move *from*
        el.classList.add(RESIZE_CLASS);
        el.style.height = `${to}px`;
        const settle = () => {
            el.classList.remove(RESIZE_CLASS);
            el.style.height = "";
        };
        // `Collapse` ends its own animation rather than waiting for a caller to
        // stop passing `from`: an inline height left behind would pin the box at
        // a size its content has outgrown. Cleanup covers the other order —
        // `from` changing, or the box going away, mid-move.
        const timer = setTimeout(settle, ANIM_MS);
        return () => {
            clearTimeout(timer);
            settle();
        };
    }, [from]);

    return (
        <div ref={box} className={`ag-anim-item${phase ? ` ag-anim-item--${phase}` : ""}`}>
            <div className="ag-anim-item-inner">{children}</div>
        </div>
    );
}
