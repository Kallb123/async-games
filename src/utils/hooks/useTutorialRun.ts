'use client'
import { useCallback, useEffect, useState } from 'react';
import { anchorSelector, applicableSteps } from '@/utils/ui/gameTutorials';
import type { TutorialRun, TutorialStep } from '@/utils/ui/gameTutorials';
import { prefersReducedMotion } from './usePrefersReducedMotion';
import { useResettingState } from './useResettingState';

// A panel that just opened, or a board that just finished laying out, isn't
// necessarily there on the very next tick — so the anchor is retried across a
// few animation frames before §9's "never appears" case gives up on it.
const FIND_RETRY_FRAMES = 20;

export interface UseTutorialRunResult {
    /** The step on screen, or null once the run has moved past the end of its
     *  frozen list — including the "every anchor missing" case (§9), which is
     *  just every step skipping in turn. The caller closes (and marks the
     *  tutorial seen) on null rather than rendering an empty card. */
    step: TutorialStep<string> | null;
    index: number;
    total: number;
    /** The spotlight target's rect, live-tracked; null for a step with no
     *  anchor (a centred card) or before its element has appeared on screen. */
    rect: DOMRect | null;
    canGoBack: boolean;
    goNext: () => void;
    goBack: () => void;
}

/**
 * The measuring half of a tutorial run (docs/game-tutorials.md §6, §11).
 * `applicableSteps` — pure, and the thing `gameTutorials.test.ts` covers — has
 * already decided the frozen step list from the signals the run started with;
 * this hook only owns what actually needs a DOM: which of those steps is
 * current, finding its element, scrolling it into view, tracking its rect as
 * the page moves under it, and watching `advanceOn` for the current step.
 */
export function useTutorialRun(run: TutorialRun): UseTutorialRunResult {
    // Frozen at first render, per §5 — after this, `run.signals` is only ever
    // read for the *current* step's `advanceOn`, never re-filtered against.
    const [steps] = useState(() => applicableSteps(run.tutorial, run.signals));
    const [index, setIndex] = useState(0);
    const step = steps[index] ?? null;

    const goNext = useCallback(() => setIndex(i => i + 1), []);
    const goBack = useCallback(() => setIndex(i => Math.max(i - 1, 0)), []);

    // The self-advance watch (§5), done during render rather than as a
    // synchronous setState inside an effect (react-hooks/set-state-in-effect,
    // the same reason `useResettingState` exists): the moment the current
    // step's `advanceOn` signal is true, move past it. A signal already true
    // at run start dropped its step in `applicableSteps` instead, so this
    // only ever fires on a live flip — and advancing changes `step`, which
    // changes what this reads next, so it settles in the same render pass
    // rather than looping.
    if (step?.advanceOn && run.signals[step.advanceOn]) {
        setIndex(i => i + 1);
    }

    // The spotlight rect resets whenever the step (or its anchor) changes —
    // `useResettingState` gets that "for free during the render that already
    // knows about the change" instead of an effect that would set it twice.
    const [rect, setRect] = useResettingState<DOMRect | null>(null, `${index}:${step?.anchor ?? ''}`);

    // Find the anchor, scroll it in, then keep measuring it for as long as
    // this step is current — §6.
    useEffect(() => {
        if (!step?.anchor) return;
        const selector = anchorSelector(step.anchor);

        let cancelled = false;
        let findFrame = 0;
        let measureFrame = 0;
        let attempts = 0;
        let resizeObserver: ResizeObserver | undefined;
        let target: Element | null = null;

        const measure = () => {
            if (target) setRect(target.getBoundingClientRect());
        };
        const scheduleMeasure = () => {
            cancelAnimationFrame(measureFrame);
            measureFrame = requestAnimationFrame(measure);
        };

        const findElement = () => {
            if (cancelled) return;
            target = document.querySelector(selector);
            if (!target) {
                attempts += 1;
                if (attempts > FIND_RETRY_FRAMES) {
                    // The anchor never showed up — skip this step silently
                    // and let the run move on (§9).
                    setIndex(i => i + 1);
                    return;
                }
                findFrame = requestAnimationFrame(findElement);
                return;
            }
            target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
            measure();
            resizeObserver = new ResizeObserver(scheduleMeasure);
            resizeObserver.observe(target);
            window.addEventListener('scroll', scheduleMeasure, true);
            window.addEventListener('resize', scheduleMeasure);
        };
        findElement();

        return () => {
            cancelled = true;
            cancelAnimationFrame(findFrame);
            cancelAnimationFrame(measureFrame);
            resizeObserver?.disconnect();
            window.removeEventListener('scroll', scheduleMeasure, true);
            window.removeEventListener('resize', scheduleMeasure);
        };
    }, [step, setRect]);

    return { step, index, total: steps.length, rect, canGoBack: index > 0, goNext, goBack };
}
