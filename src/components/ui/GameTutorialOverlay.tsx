'use client'
import { useEffect, useRef } from 'react';
import { useCloseRequest } from '@/utils/hooks/useCloseRequest';
import { useTutorialRun } from '@/utils/hooks/useTutorialRun';
import type { TutorialRun } from '@/utils/ui/gameTutorials';

interface GameTutorialOverlayProps {
    run: TutorialRun;
    /** Called once, whether the player finishes the tour, taps "Skip tour",
     *  or backs out of it (Escape / Android back) — `GameShell`'s caller
     *  wires this to `useGameIntro`'s `close`, which marks the tutorial seen
     *  either way. */
    onClose: () => void;
}

/**
 * The tour itself: a spotlight ring around the current step's element and a
 * bottom card naming it, both driven entirely by `useTutorialRun` — this
 * component makes no decision of its own about which step is showing.
 *
 * The spotlight is one `.ag-tour-spot` box, sized to the anchor's rect, whose
 * scrim-and-ring is a single `box-shadow` (docs/game-tutorials.md §6) — it
 * takes no pointer events, so the board underneath is never blocked. A step
 * with no anchor (the opening welcome, the closing "that's it") renders no
 * spotlight at all, just the card.
 */
export default function GameTutorialOverlay({ run, onClose }: GameTutorialOverlayProps) {
    const { step, index, total, rect, canGoBack, goNext, goBack } = useTutorialRun(run);
    const headingRef = useRef<HTMLDivElement>(null);

    useCloseRequest(true, onClose);

    // §9: a run with nothing left to show (every step done, or every anchor
    // in it missing) closes itself rather than leaving an empty scrim up.
    useEffect(() => {
        if (!step) onClose();
    }, [step, onClose]);

    // §10: each step change moves focus to the card's heading, announcing the
    // new message and putting the keyboard where the controls are in one move.
    useEffect(() => {
        if (step) headingRef.current?.focus();
    }, [step]);

    if (!step) return null;

    // A do-it step shows its hint instead of "Next ›" while the player could
    // still act on it — and reverts to a real "Next ›" the moment its `when`
    // signal stops holding, so a turn ending or an opponent moving can't trap
    // the run on a control that's no longer there to tap (§9). The last step
    // in the run says "End tutorial" instead, so tapping it reads as finishing
    // rather than moving on to a step that isn't there.
    const waitingOnPlayer = !!step.advanceOn && (!step.when || run.signals[step.when]);
    const isLastStep = index === total - 1;
    const nextLabel = waitingOnPlayer && step.hint ? step.hint : (isLastStep ? 'End tutorial' : 'Next ›');

    return (
        <>
            {rect && (
                <div
                    className="ag-tour-spot"
                    style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
                    aria-hidden="true"
                />
            )}
            <div className="ag-banner ag-tour-card">
                <div className="ag-banner-inner ag-cta ag-cta--dark" role="dialog" aria-modal="false" aria-label={`Tutorial, step ${index + 1} of ${total}`}>
                    <div className="ag-cta-main">
                        <div className="ag-cta-title" tabIndex={-1} ref={headingRef}>{step.title}</div>
                        <div className="ag-cta-sub">{step.body}</div>
                        <div className="ag-tour-actions">
                            <button type="button" className="ag-tour-skip" onClick={onClose}>Skip tour</button>
                            <div className="ag-tour-actions-nav">
                                {canGoBack && <button type="button" className="ag-tour-back" onClick={goBack}>{'‹ Back'}</button>}
                                <button type="button" className="ag-btn ag-btn--primary" onClick={goNext} disabled={waitingOnPlayer}>{nextLabel}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
