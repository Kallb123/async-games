import React from 'react';
import Dice from './Dice';

/**
 * The dice a roll landed on, with what it came to and what it moved written
 * beside them — the dark card every dice game shows after a throw.
 *
 * Shared because two games want the same card for the same beat: Dice Cities
 * shows it over the market once the payouts land (and again while the Harbour's
 * decision parks a roll, unpaid), and Settlements & Cities shows it under the
 * board as the turn's roll and who the terrain paid. Pass `rolling` while the
 * throw is animating to tumble the faces in place.
 *
 * `sub` is optional: a roll with nothing to say about what it moved shows the
 * dice and the total alone rather than a line claiming nothing happened.
 */
export default function RollReadout({ values, headline, sub, rolling, className }: {
    values: number[];
    headline: string;
    sub?: string;
    rolling?: boolean;
    /** Layout only — the caller's margins, where the card sits in their column. */
    className?: string;
}) {
    return (
        <div className={`ag-roll${className ? ` ${className}` : ''}`}>
            <Dice values={values} size={40} rolling={rolling} />
            <div className="ag-roll-main">
                <div className="ag-roll-total">{headline}</div>
                {sub && <div className="ag-roll-sub">{sub}</div>}
            </div>
        </div>
    );
}
