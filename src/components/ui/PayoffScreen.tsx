'use client'
import React from 'react';
import BackArrow from '@/components/ui/BackArrow';

export interface PayoffScreenProps {
    title: string;
    subtitle: React.ReactNode;
    /** Shown as a back arrow in the top-left of the topbar — omit for a screen with no way to dismiss except the CTA. */
    onClose?: () => void;
    /** Combined with the shared `ag-payoff-stage` base class — a game's own gradient-by-outcome modifier (e.g. `ag-sl-roll-stage--snake`). */
    stageClassName: string;
    /** The stage's own content: the die/dice, the verdict icon and title, whatever a game's reveal needs. */
    children: React.ReactNode;
    /** Extra content in the bottom sheet, above the CTA button. */
    noteAbove?: React.ReactNode;
    /** Extra content in the bottom sheet, below the CTA button. */
    noteBelow?: React.ReactNode;
    ctaLabel: React.ReactNode;
    onCta: () => void;
    ctaDisabled?: boolean;
    /** Defaults to the primary button style — Snakes & Ladders' roll result uses the success one instead. */
    ctaClassName?: string;
}

/**
 * The shared shell for a full-screen async payoff reveal: a die (or dice)
 * tumbles, settles, and the outcome reveals — SnakesAndLaddersRollResult.tsx
 * was the first of these; FiresOutAdvanceFireResult.tsx is the second, and
 * caveman review is right that "second copy of the shell" is exactly the
 * "extract it now" signal fires-out-gdd.md §17.6 step 7 flagged in advance.
 * Only the shell is shared — the stage's content (what the roll means, and
 * how it's revealed) stays bespoke per game, since that's genuinely
 * different in each one.
 */
export default function PayoffScreen({
    title, subtitle, onClose, stageClassName, children, noteAbove, noteBelow,
    ctaLabel, onCta, ctaDisabled, ctaClassName = 'ag-btn--primary',
}: PayoffScreenProps) {
    return (
        <div className="ag-payoff-screen">
            <div className="ag-game-topbar">
                {onClose && (
                    <button className="ag-game-topbar-btn" onClick={onClose} aria-label="Close"><BackArrow /></button>
                )}
                <div className="ag-game-topbar-main">
                    <div className="ag-game-topbar-title">{title}</div>
                    <div className="ag-game-topbar-sub">{subtitle}</div>
                </div>
            </div>

            <div className={`ag-payoff-stage ${stageClassName}`}>
                {children}
            </div>

            <div className="ag-payoff-sheet">
                <div className="ag-payoff-grip" />
                {noteAbove}
                <button className={`ag-btn ${ctaClassName} ag-btn--block`} onClick={onCta} disabled={ctaDisabled}>
                    {ctaLabel}
                </button>
                {noteBelow}
            </div>
        </div>
    );
}
