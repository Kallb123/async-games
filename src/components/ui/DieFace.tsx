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
 * A single tactile die face showing a value as pips or a numeral — an
 * octahedral d8 is printed with numerals in real life, not pips, so it says
 * so with `sides` rather than switching on the value it happened to roll
 * (fires-out-gdd.md §17.2 gap 4: "the fix is a numeral variant in the shared
 * component — not a bespoke Fires Out die that leaves the next game with a
 * d8 to solve it again"). A die keeps one face all roll long that way: a d8
 * showing 3 is still a numeral, where switching on the value alone made it
 * flicker between pips and numerals as it tumbled. Pips are for dice of six
 * or fewer sides, so a d4 stays pipped and a d10 or d12 is numbered without
 * anyone revisiting this. Presentational only — used directly, or via the
 * Dice component for rows of more than one die.
 */
export default function DieFace({ value, size = 64, sides = 6 }: { value: number; size?: number; sides?: number }) {
    const pips = sides <= 6 ? PIP_LAYOUT[value] : undefined;
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
