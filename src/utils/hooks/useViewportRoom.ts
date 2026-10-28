'use client'
import { useSyncExternalStore } from 'react';
import { HEIGHT_VARS } from '@/utils/hooks/useHeightVar';

/**
 * The screen's height less the app's fixed bottom furniture — the offer banner,
 * the review dock, a game's pinned action sheet — whose heights `useHeightVar`
 * publishes on the document root as it measures them. They are read off the
 * root's own style, where they are set, rather than computed: that costs no
 * style recalculation, and an unset one is the stylesheet's `0px`.
 */
function room(): number {
    const { style } = document.documentElement;
    const docks = HEIGHT_VARS.reduce((total, name) => total + (parseFloat(style.getPropertyValue(name)) || 0), 0);
    return window.innerHeight - docks;
}

/** Told when either may have changed: the window resizing (a rotation, a toolbar sliding away), or a dock coming, going or changing height. */
function subscribe(onChange: () => void) {
    window.addEventListener('resize', onChange);
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => {
        window.removeEventListener('resize', onChange);
        observer.disconnect();
    };
}

/**
 * How much of the screen is the page's to use: its height less the docks fixed
 * across the foot of it, as one number from one subscription. Nothing before
 * the browser has one (the server, and the render hydrating from it).
 */
export function useViewportRoom(): number {
    return useSyncExternalStore(subscribe, room, () => 0);
}
