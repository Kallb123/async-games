'use client'

import { useEffect } from "react";

interface SeatCountSelectProps {
    value: number;
    onChange: (value: number) => void;
    /** Most open seats the party can afford right now — usually the game's
     *  `maxPlayers` minus the named invitees above and the host themselves. */
    max: number;
}

/**
 * How many seats a join-by-code lobby leaves open for a stranger to claim,
 * alongside whoever is named above in `UserInviteList`. Shared by every
 * multiplayer setup screen (mirrors `TurnTimerSelect`'s shape) rather than
 * six copies of the same `<select>`.
 */
export default function SeatCountSelect({ value, onChange, max }: SeatCountSelectProps) {
    const bound = Math.max(max, 0);

    // `max` shrinks as named invitees are added; keep the chosen count from
    // going stale rather than silently submitting a party size that no
    // longer fits.
    useEffect(() => {
        if (value > bound) {
            onChange(bound);
        }
    }, [value, bound, onChange]);

    const seatCount = Math.min(value, bound);

    return (
        <div className="ag-section" style={{ padding: "20px 20px 0" }}>
            <div className="ag-section-head">
                <h2 className="ag-section-label">Open seats</h2>
            </div>
            <select
                className="ag-select"
                value={seatCount}
                onChange={(e) => onChange(Number(e.target.value))}
            >
                {Array.from({ length: bound + 1 }, (_, seats) => seats).map(seats => (
                    <option key={seats} value={seats}>
                        {seats === 0 ? "None — invite only" : `${seats} seat${seats === 1 ? "" : "s"} — join by code`}
                    </option>
                ))}
            </select>
            <p className="ag-hint">
                {seatCount === 0
                    ? "Only the people you invite above can join."
                    : `Anyone with the code can grab ${seatCount === 1 ? "the open seat" : `one of the ${seatCount} open seats`} once the game is created.`}
            </p>
        </div>
    );
}
