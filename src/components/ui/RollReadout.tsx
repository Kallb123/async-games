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
 *
 * `sides` is forwarded to `Dice` so a card over a game that does not roll d6s
 * draws the die it actually threw: `DieFace` prints anything over six sides as
 * a numeral, and without this a Race Cars driver who bet on the d20 would be
 * shown a pipped d6 — the card exists to say which die was thrown.
 */
export default function RollReadout({ values, headline, sub, rolling, sides, className }: {
    values: number[];
    headline: string;
    sub?: string;
    rolling?: boolean;
    /** Faces on each die, positionally — omit for a row of d6s. */
    sides?: number[];
    /** Layout only — the caller's margins, where the card sits in their column. */
    className?: string;
}) {
    return (
        <div className={`ag-roll${className ? ` ${className}` : ''}`}>
            <Dice values={values} size={40} rolling={rolling} sides={sides} />
            <div className="ag-roll-main">
                <div className="ag-roll-total">{headline}</div>
                {sub && <div className="ag-roll-sub">{sub}</div>}
            </div>
        </div>
    );
}
