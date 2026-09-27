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
            if (event.touches.length !== 1 || window.scrollY > 0) {
                start = null;
                return;
            }
            start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            distance = 0;
        };
        const onMove = (event: TouchEvent) => {
            if (start === null) {
                return;
            }
            const dx = event.touches[0].clientX - start.x;
            const dy = event.touches[0].clientY - start.y;
            // Sideways, back up, a second finger or a page that has scrolled
            // under the finger: this was never a pull.
            if (event.touches.length !== 1 || dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) {
                reset();
                return;
            }
            distance = Math.min(PULL_MAX_PX, dy * PULL_DAMPING);
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
