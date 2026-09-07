'use client'

import CountSelect from "@/components/ui/CountSelect";

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
 * six copies of the same `<select>`; the select, its range and its hint line
 * are `CountSelect`, so this is only the copy that makes it about seats.
 */
export default function SeatCountSelect({ value, onChange, max }: SeatCountSelectProps) {
    return (
        <CountSelect
            label="Open seats"
            value={value}
            onChange={onChange}
            // `useCreateLobbyOrInvite` clamps the chosen count to `max`
            // already; the floor of 0 is "invite only".
            max={Math.max(max, 0)}
            optionLabel={(seats) => seats === 0 ? "None — invite only" : `${seats} seat${seats === 1 ? "" : "s"} — join by code`}
            hint={value === 0
                ? "Only the people you invite above can join."
                : `Anyone with the code can grab ${value === 1 ? "the open seat" : `one of the ${value} open seats`} once the game is created.`}
        />
    );
}
