'use client'
import { useEffect, useRef } from 'react';

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
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        ref.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }, [open]);

    return ref;
}
