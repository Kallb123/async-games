import React from 'react';
import DieFace from './DieFace';

/**
 * A row of dice — wraps DieFace so any screen that needs one die or many
 * (World Domination battles, a Dice Cities roll, a Catan turn) renders them
 * the same way. Pass `rolling` while a roll is animating to tumble in place,
 * and `sides` when the row isn't all d6s — Fires Out rolls a d6 and a d8
 * together, and the d8 is numbered rather than pipped for its whole range.
 */
export default function Dice({ values, size = 64, rolling = false, sides }: { values: number[]; size?: number; rolling?: boolean; sides?: number[] }) {
    return (
        <div className={`ag-dice-row${rolling ? ' ag-dice-row--rolling' : ''}`}>
            {values.map((value, i) => (
                <DieFace key={i} value={value} size={size} sides={sides?.[i]} />
            ))}
        </div>
    );
}
