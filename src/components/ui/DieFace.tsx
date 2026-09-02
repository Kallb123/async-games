import React from 'react';

// Pip layout on a 3×3 grid (cell indices 0–8) for each die value.
const PIP_LAYOUT: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 3, 6, 2, 5, 8],
};

/**
 * A single tactile die face showing a value as pips (1–6) or, past 6, a
 * numeral — an octahedral d8 is printed with numerals in real life, not
 * pips, so `PIP_LAYOUT` simply has no row above 6 rather than a wrong one
 * (fires-out-gdd.md §17.2 gap 4: "the fix is a numeral variant in the shared
 * component — not a bespoke Fires Out die that leaves the next game with a
 * d8 to solve it again"). Presentational only — used directly, or via the
 * Dice component for rows of more than one die.
 */
export default function DieFace({ value, size = 64 }: { value: number; size?: number }) {
    const pips = PIP_LAYOUT[value];
    const style = { '--ag-die-size': `${size}px` } as React.CSSProperties;

    if (!pips) {
        return (
            <div className="ag-die ag-die--numeral" style={style} aria-label={`Rolled ${value}`}>
                {value}
            </div>
        );
    }

    const lit = new Set(pips);
    return (
        <div className="ag-die" style={style} aria-label={`Rolled ${value}`}>
            {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className={`ag-die-pip${lit.has(i) ? ' ag-die-pip--on' : ''}`} />
            ))}
        </div>
    );
}
