'use client'
import { useSyncExternalStore } from 'react';

// "Does this player want animation?", in the two forms the app asks it.
//
// The query string was written out twice before this — once here and once in
// useScrollIntoViewOnOpen — which is the signal to extract. It is the one
// accessibility preference this app branches on in JS rather than in CSS (the
// stylesheet's own `@media (prefers-reduced-motion: reduce)` blocks handle
// everything that is purely a matter of styling), so both readers live here.
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * The preference, read once, for a caller that is about to do something and
 * wants to know how — `scrollIntoView`'s `behavior`, say. Client-only: it
 * touches `window`.
 */
export function prefersReducedMotion(): boolean {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * The preference as state, for a caller whose *render* depends on it — the
 * chat thread draws a GIF's still frame rather than the animation.
 *
 * `useSyncExternalStore` rather than matchMedia-in-an-effect plus `setState`,
 * which is what the React Compiler's `react-hooks/set-state-in-effect` rule
 * exists to refuse — and it gets the two things that pattern gets wrong for
 * free: the server snapshot (`false`, i.e. render the ordinary thing), and a
 * player who changes the setting mid-session without reloading.
 */
export function usePrefersReducedMotion(): boolean {
    return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

// Module-scope, so its identity is stable across renders — a `subscribe` that
// changed every render would tear the subscription down and rebuild it.
function subscribe(onChange: () => void) {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
}
