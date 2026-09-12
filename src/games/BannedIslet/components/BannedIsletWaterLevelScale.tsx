'use client'
import React from 'react';
import { LOSING_WATER_LEVEL, WATER_LEVEL_TRACK } from '@/games/BannedIslet/board';

interface BannedIsletWaterLevelScaleProps {
    /** §11's meter — 1 to 9 show a flood rate, 10 is the skull (§4.2). */
    waterLevel: number;
}

/**
 * The escalation scale behind the "Water level" stat: §11's 2-2-3-4-4-5-5-6-6
 * meter plus the skull at the end, laid out with the current space lit. Opens
 * as a slice under the stat row when the stat is tapped — Outbreak's
 * infection-rate drawer wears the identical move for the identical reason.
 */
export default function BannedIsletWaterLevelScale({ waterLevel }: BannedIsletWaterLevelScaleProps) {
    const current = Math.min(Math.max(Math.trunc(waterLevel), 1), LOSING_WATER_LEVEL) - 1;

    return (
        <div className="ag-escalation-scale">
            <div className="ag-escalation-scale-track">
                {WATER_LEVEL_TRACK.map((rate, i) => (
                    <div
                        key={i}
                        className={
                            'ag-escalation-scale-space'
                            + (i === current ? ' ag-escalation-scale-space--current' : '')
                            + (i < current ? ' ag-escalation-scale-space--past' : '')
                        }
                        aria-current={i === current ? 'true' : undefined}
                    >
                        {rate}
                    </div>
                ))}
                <div
                    className={
                        'ag-escalation-scale-space ag-escalation-scale-space--skull'
                        + (current === LOSING_WATER_LEVEL - 1 ? ' ag-escalation-scale-space--current' : '')
                    }
                    aria-current={current === LOSING_WATER_LEVEL - 1 ? 'true' : undefined}
                >
                    💀
                </div>
            </div>
            <p className="ag-escalation-scale-note">
                Every Waters Rise! nudges the marker one space along. Where it lands is how many
                flood cards are drawn at the end of each turn — reaching the skull loses the game.
            </p>
        </div>
    );
}
