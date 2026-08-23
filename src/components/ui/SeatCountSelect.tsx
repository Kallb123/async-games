'use client'

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
    // `useCreateLobbyOrInvite` clamps the chosen count to `max` already, so
    // `value` is always in range; this only guards a full party, where the
    // game's maximum leaves no seat to open.
    const bound = Math.max(max, 0);

    return (
        <div className="ag-section" style={{ padding: "20px 20px 0" }}>
            <div className="ag-section-head">
                <h2 className="ag-section-label">Open seats</h2>
            </div>
            <select
                className="ag-select"
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
            >
                {Array.from({ length: bound + 1 }, (_, seats) => seats).map(seats => (
                    <option key={seats} value={seats}>
                        {seats === 0 ? "None — invite only" : `${seats} seat${seats === 1 ? "" : "s"} — join by code`}
                    </option>
                ))}
            </select>
            <p className="ag-hint">
                {value === 0
                    ? "Only the people you invite above can join."
                    : `Anyone with the code can grab ${value === 1 ? "the open seat" : `one of the ${value} open seats`} once the game is created.`}
            </p>
        </div>
    );
}
