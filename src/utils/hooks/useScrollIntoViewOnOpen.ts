'use client'
import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from './usePrefersReducedMotion';

/**
 * Brings a panel into view (its top, so a later height change as content
 * loads doesn't move the target) the moment it opens. Used by `GameShell`
 * for both the chat thread and the turn-history panel, which both render
 * below the board — on a tall board, toggling one on can change nothing in
 * the viewport, reading as a dead tap. Honours reduced motion, the way the
 * CSS panel-open pulse does.
 */
export function useScrollIntoViewOnOpen(open: boolean) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }
        ref.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }, [open]);

    return ref;
}
