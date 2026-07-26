import React from 'react';
import DieFace from './DieFace';

/**
 * A row of pip dice — wraps DieFace so any screen that needs one die or many
 * (World Domination battles, a Dice Cities roll, a Catan turn) renders them
 * the same way. Pass `rolling` while a roll is animating to tumble in place.
 */
export default function Dice({ values, size = 64, rolling = false }: { values: number[]; size?: number; rolling?: boolean }) {
    return (
        <div className={`ag-dice-row${rolling ? ' ag-dice-row--rolling' : ''}`}>
            {values.map((value, i) => (
                <DieFace key={i} value={value} size={size} />
            ))}
        </div>
    );
}
