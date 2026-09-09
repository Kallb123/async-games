'use client'
import { useCallback } from 'react';

/**
 * Measures an element and publishes its height as a CSS custom property on the
 * document root, so ag-theme.css can hold that much space clear for it.
 *
 * This is for the app's fixed bottom furniture — the offer banner, the match
 * review dock. Each is fixed to the viewport (it has to be, to stay put through
 * the game screens' own scrolling), so it takes up no room in the flow and
 * would otherwise sit on top of whatever the page ends with. Its height is not
 * a constant the stylesheet could hard-code: copy wraps differently per offer
 * and per width, and the safe-area inset varies by device. So it is measured,
 * and re-measured whenever it changes, rather than guessed.
 *
 * Returns a ref callback: attach it to the fixed element. React 19 runs the
 * cleanup when that element goes away — the offer is dismissed, the player goes
 * back to the live game — which drops the variable and gives the space straight
 * back.
 */
/** The height tokens `ag-theme.css` declares for this. Named rather than left
 *  as `string` so a typo is a type error, not a variable nothing reads. */
type HeightVar = '--ag-banner-height' | '--ag-review-dock-height';

export function useHeightVar(cssVar: HeightVar) {
    return useCallback((node: HTMLElement | null) => {
        // React 19 detaches by running the cleanup below rather than by calling
        // this again with null, but the ref type still allows it.
        if (!node) return;
        const observer = new ResizeObserver(() => {
            document.documentElement.style.setProperty(cssVar, `${node.offsetHeight}px`);
        });
        observer.observe(node);
        return () => {
            observer.disconnect();
            document.documentElement.style.removeProperty(cssVar);
        };
    }, [cssVar]);
}
