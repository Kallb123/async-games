'use client'
import { useEffect, useRef, useState } from 'react';

/** How far (px, after damping) the page has to be pulled to count as a refresh. */
export const PULL_THRESHOLD_PX = 64;

/** How far the indicator will follow the finger before it stops. */
const PULL_MAX_PX = 96;

/** The finger moves this much further than the indicator — the "rubber" in the
 *  pull, and what keeps an accidental drag from refreshing. */
const PULL_DAMPING = 0.5;

/**
 * How far a pull has gone, in px, for a finger that started at `start` and is
 * now at `now` — or null if this was never a pull: sideways (a carousel swipe),
 * back up past where it began, or on a page that has scrolled under the finger.
 * Pure, so the gesture's rules can be tested without a touchscreen.
 */
export function pullDistance(
    start: { x: number; y: number },
    now: { x: number; y: number },
    scrollY: number,
): number | null {
    const dx = now.x - start.x;
    const dy = now.y - start.y;
    if (dy <= 0 || Math.abs(dx) > dy || scrollY > 0) {
        return null;
    }
    return Math.min(PULL_MAX_PX, dy * PULL_DAMPING);
}

/**
 * Pull down from the top of the page to call `onRefresh` — the phone gesture
 * for "check again now", on a screen that otherwise only re-asks on its poll,
 * a push or a return to the foreground.
 *
 * Listens on `window` because the page itself is the scroller on every screen
 * that wears it. A pull only starts from a single finger at the very top of the
 * page, and is dropped the moment the finger goes sideways (a carousel swipe)
 * or back up past where it began. The listeners are passive — nothing here
 * ever holds up a scroll — so Chrome's own pull-to-reload is switched off in
 * CSS instead (`html:has(.ag-pull)`), where that belongs.
 *
 * Returns how far the page is currently pulled, in px, for the indicator to
 * follow; 0 when nobody is pulling.
 */
export function usePullToRefresh(onRefresh: () => void): number {
    const [pull, setPull] = useState(0);
    // Read from the listeners, which are registered once, so the caller can pass
    // an inline function.
    const onRefreshRef = useRef(onRefresh);
    useEffect(() => {
        onRefreshRef.current = onRefresh;
    });

    useEffect(() => {
        let start: { x: number; y: number } | null = null;
        let distance = 0;

        const reset = () => {
            start = null;
            distance = 0;
            setPull(0);
        };
        const onStart = (event: TouchEvent) => {
            // A second finger landing mid-pull ends the pull outright, rather
            // than leaving the badge parked where it was.
            if (event.touches.length !== 1 || window.scrollY > 0) {
                reset();
                return;
            }
            start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            distance = 0;
        };
        const onMove = (event: TouchEvent) => {
            if (start === null) {
                return;
            }
            const next = event.touches.length === 1
                ? pullDistance(start, { x: event.touches[0].clientX, y: event.touches[0].clientY }, window.scrollY)
                : null;
            if (next === null) {
                reset();
                return;
            }
            distance = next;
            setPull(distance);
        };
        const onEnd = () => {
            if (start !== null && distance >= PULL_THRESHOLD_PX) {
                onRefreshRef.current();
            }
            reset();
        };

        window.addEventListener('touchstart', onStart, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', reset);
        return () => {
            window.removeEventListener('touchstart', onStart);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
            window.removeEventListener('touchcancel', reset);
        };
    }, []);

    return pull;
}
