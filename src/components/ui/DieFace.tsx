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
 * A single tactile die face showing a value 1–6 as pips. Presentational only —
 * used directly, or via the Dice component for rows of more than one die.
 */
export default function DieFace({ value, size = 64 }: { value: number; size?: number }) {
    const pips = PIP_LAYOUT[value] ?? [];
    const lit = new Set(pips);
    return (
        <div
            className="ag-die"
            style={{ '--ag-die-size': `${size}px` } as React.CSSProperties}
            aria-label={`Rolled ${value}`}
        >
            {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className={`ag-die-pip${lit.has(i) ? ' ag-die-pip--on' : ''}`} />
            ))}
        </div>
    );
}
