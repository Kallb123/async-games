'use client'
import { useCallback } from 'react';

/** The room the fixed bottom banner needs, published for the layout to reserve. */
const HEIGHT_VAR = '--ag-banner-height';

/**
 * Measures the bottom banner and publishes its height as `--ag-banner-height`
 * on the document root, so ag-theme.css can hold that much space clear at the
 * bottom of every screen.
 *
 * The banner is fixed to the viewport — it has to be, to stay put through the
 * game screens' own scrolling — so it takes up no room in the flow and would
 * otherwise sit on top of whatever the page ends with. Its height is not a
 * constant the stylesheet could hard-code: the copy wraps differently per
 * offer and per width, and the safe-area inset varies by device. So it is
 * measured, and re-measured whenever it changes, rather than guessed.
 *
 * Returns a ref callback: attach it to the banner element. React 19 runs the
 * cleanup when that element goes away — the offer is dismissed, or none
 * qualifies — which drops the variable and gives the space straight back.
 */
export function useBannerHeight() {
    return useCallback((node: HTMLElement | null) => {
        // React 19 detaches by running the cleanup below rather than by calling
        // this again with null, but the ref type still allows it.
        if (!node) return;
        const observer = new ResizeObserver(() => {
            document.documentElement.style.setProperty(HEIGHT_VAR, `${node.offsetHeight}px`);
        });
        observer.observe(node);
        return () => {
            observer.disconnect();
            document.documentElement.style.removeProperty(HEIGHT_VAR);
        };
    }, []);
}
