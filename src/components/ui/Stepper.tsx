import React from 'react';

interface StepperProps {
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
    /** Names what is being counted for a screen reader — "armies", "brake points". */
    label?: string;
    /** How far one press moves the value — 1 unless counting in bigger lots, like a cart's load. */
    step?: number;
}

/**
 * The −/value/+ control for picking a number inside a range: how many armies to
 * deploy, how many dice to roll, how many brake points to spend.
 *
 * Extracted from World Domination's four local copies the moment a second game
 * wanted one (AGENTS.md: a second copy is the signal to extract the first), and
 * its inline `width: 40` / `font: '800 18px'` magic numbers became the
 * `ag-stepper` pair in `ag-theme.css` on the way past — so a game that re-tints
 * the chrome re-tints this too, rather than keeping one hard-coded control in
 * the middle of its own livery.
 *
 * Both buttons clamp as well as disable: `disabled` is the affordance, the
 * clamp is what makes a held key or a stale render unable to walk the value
 * out of range.
 */
export default function Stepper({ value, min, max, onChange, label, step = 1 }: StepperProps) {
    return (
        <div className="ag-stepper">
            <button
                type="button"
                className="ag-btn ag-btn--light ag-stepper-btn"
                aria-label={step === 1 ? (label ? `One fewer ${label}` : 'One fewer') : `${step} fewer${label ? ` ${label}` : ''}`}
                disabled={value <= min}
                onClick={() => onChange(Math.max(min, value - step))}
            >
                −
            </button>
            <span className="ag-stepper-value" aria-label={label ? `${value} ${label}` : undefined}>{value}</span>
            <button
                type="button"
                className="ag-btn ag-btn--light ag-stepper-btn"
                aria-label={step === 1 ? (label ? `One more ${label}` : 'One more') : `${step} more${label ? ` ${label}` : ''}`}
                disabled={value >= max}
                onClick={() => onChange(Math.min(max, value + step))}
            >
                +
            </button>
        </div>
    );
}
