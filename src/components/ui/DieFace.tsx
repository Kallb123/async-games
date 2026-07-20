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
 * A static tactile die face showing a single value 1–6 as pips — the payoff
 * face on the Snakes & Ladders roll-result screen. Presentational only; the
 * animated tumble lives in AnimatedDice.
 */
export default function DieFace({ value, size = 64 }: { value: number; size?: number }) {
    const pips = PIP_LAYOUT[value] ?? [];
    const lit = new Set(pips);
    return (
        <div className="ag-die" style={{ width: size, height: size }} aria-label={`Rolled ${value}`}>
            {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className={`ag-die-pip${lit.has(i) ? ' ag-die-pip--on' : ''}`} />
            ))}
        </div>
    );
}
