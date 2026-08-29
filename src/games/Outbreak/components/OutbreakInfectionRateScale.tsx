'use client'
import React from 'react';
import { INFECTION_RATE_TRACK } from '@/games/Outbreak/rules';

interface OutbreakInfectionRateScaleProps {
    /** Where the marker sits on the track — clamped to the last space. */
    infectionRateIndex: number;
}

/**
 * The escalation scale behind the "Infection rate" stat: the 2-2-2-3-3-4-4
 * track (§9.1 step 1) laid out with the current space lit. Opens as a slice
 * under the stat row when the stat is tapped — the same move as Train Time's
 * ticket drawer, so nothing new to learn.
 */
export default function OutbreakInfectionRateScale({ infectionRateIndex }: OutbreakInfectionRateScaleProps) {
    const current = Math.min(infectionRateIndex, INFECTION_RATE_TRACK.length - 1);

    return (
        <div className="ag-ob-ratescale">
            <div className="ag-ob-ratescale-track">
                {INFECTION_RATE_TRACK.map((rate, i) => (
                    <div
                        key={i}
                        className={
                            'ag-ob-ratescale-space'
                            + (i === current ? ' ag-ob-ratescale-space--current' : '')
                            + (i < current ? ' ag-ob-ratescale-space--past' : '')
                        }
                        aria-current={i === current ? 'true' : undefined}
                    >
                        {rate}
                    </div>
                ))}
            </div>
            <p className="ag-ob-ratescale-note">
                Every epidemic nudges the marker one space along. Where it lands is how many
                infection cards are drawn at the end of each turn.
            </p>
        </div>
    );
}
