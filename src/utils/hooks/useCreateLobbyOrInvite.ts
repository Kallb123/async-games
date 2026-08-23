'use client'
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastContext";
import type { IInvitationRequest } from "@/utils/mongodb/InvitationData";
import type { ILobbyRequest } from "@/app/api/lobby/route";
import { partySizeErrorMessage, type GameMeta } from "@/utils/ui/games";

interface CreateLobbyOrInviteOptions {
    /** The game's presentation metadata — supplies the party-size bounds. */
    meta: GameMeta;
    /**
     * The PascalCase discriminator each game's own invite route already
     * hard-codes (e.g. "TrainTime").
     */
    gameType: string;
    /** That route, e.g. "/api/newgame/traintime". */
    invitePath: string;
    /** How many people the host has named in `UserInviteList` so far. */
    invitedCount: number;
}

/**
 * The seat-count state every multiplayer setup screen now carries, plus the
 * submit branch it drives: 0 open seats keeps today's behaviour exactly
 * (POST to the game's own `/api/newgame/<game>`, toast, back to the
 * dashboard), while opening at least one seat creates a join-by-code lobby
 * instead (POST `/api/lobby`) and takes the host to its lobby screen.
 *
 * Keeping the old path for `seatCount === 0` means a host who never touches
 * this control gets the exact request/response shape they got before — no
 * join code, no lobby expiry — rather than every invite silently gaining a
 * one-hour TTL it never had.
 *
 * Because the branch depends on the whole party — named invitees *and* open
 * seats — this hook also owns the party arithmetic each screen used to redo
 * for itself: how many seats are still affordable, how big the party is, and
 * whether the primary action can fire. An open seat is a player (a
 * code-holder claims it), so "two open seats and nobody named" is a perfectly
 * good party and the button stays live for it.
 */
export function useCreateLobbyOrInvite({ meta, gameType, invitePath, invitedCount }: CreateLobbyOrInviteOptions) {
    const [chosenSeats, setSeatCount] = useState(0);
    const router = useRouter();
    const { showToast } = useToast();

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
    // Somebody has to be playing besides the host — a game whose minimum is 1
    // (Smartthink) would otherwise let an empty invite through.
    const canSubmit = invitedCount + seatCount > 0 && !partySizeError;

    const openingSeats = seatCount > 0;
    const actionLabel = openingSeats
        ? (invitedCount > 0 ? "Send invites & get code" : "Create lobby & get code")
        : "Send invites & start";
    const footnote = openingSeats
        ? "Share the code to fill the open seats"
        : "Game begins once everyone accepts";

    const submit = async <T extends IInvitationRequest>(data: T) => {
        if (partySizeError) {
            showToast(partySizeError, 'danger');
            return;
        }
        try {
            if (seatCount > 0) {
                const lobbyRequest: ILobbyRequest = { ...data, gameType, seatCount } as unknown as ILobbyRequest;
                const response = await fetch('/api/lobby', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(lobbyRequest)
                });
                if (!response.ok) {
                    throw new Error('Failed to create lobby');
                }
                const { inviteId } = await response.json();
                router.push(`/lobby/${inviteId}`);
            } else {
                const response = await fetch(invitePath, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                if (!response.ok) {
                    throw new Error('Failed to send invite');
                }
                showToast('Invitation sent! Waiting for players to accept.', 'success', 'Invite Sent');
                router.push('/');
            }
        } catch (error) {
            console.error(error);
            showToast('Failed to send the invitation. Please try again.', 'danger');
        }
    };

    return {
        seatCount,
        setSeatCount,
        maxSeats,
        partySize,
        partySizeError,
        canSubmit,
        actionLabel,
        footnote,
        submit,
    };
}
