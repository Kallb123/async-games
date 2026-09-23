'use client'
import { useState } from "react";
import { partySizeErrorMessage, type PartySizeMeta } from "@/utils/ui/games";

/**
 * The party arithmetic every multiplayer setup screen does: how many open
 * seats the host has chosen, how many they can still afford, how big the
 * party is and whether it is one the game supports. An open seat is a player
 * (a code-holder claims it), so "two open seats and nobody named" is a
 * perfectly good party.
 *
 * `useCreateLobbyOrInvite` wraps this with the lobby-or-invite submit most
 * games use; a screen that submits differently (Kingdom Builder, whose world
 * exists before anyone joins it) uses this alone.
 *
 * @param invitedCount how many people the host has named in `UserInviteList`
 * @param initialSeats the open-seat count the control starts on
 */
export function usePartySeats(meta: PartySizeMeta, invitedCount: number, initialSeats = 0) {
    const [chosenSeats, setSeatCount] = useState(initialSeats);

    // Most seats the party can still afford: the game's maximum, less the
    // people already named, less the host themselves.
    const maxSeats = meta.maxPlayers - invitedCount - 1;
    // Naming somebody shrinks `maxSeats`, so clamp rather than let a
    // previously-chosen count stand and submit a party that no longer fits.
    const seatCount = Math.min(chosenSeats, Math.max(maxSeats, 0));
    // The host isn't a userIdList entry (they're senderId), so the party is
    // the named invitees, plus the open seats, plus the host themselves.
    const partySize = invitedCount + seatCount + 1;
    const partySizeError = partySizeErrorMessage(meta, partySize);

    return { seatCount, setSeatCount, maxSeats, partySize, partySizeError };
}
