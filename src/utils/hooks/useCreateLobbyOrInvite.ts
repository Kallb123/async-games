'use client'
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastContext";
import type { IInvitationRequest } from "@/utils/mongodb/InvitationData";
import type { ILobbyRequest } from "@/app/api/lobby/route";

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
 * `gameType` is the PascalCase discriminator each game's own invite route
 * already hard-codes (e.g. "TrainTime"); `invitePath` is that route.
 */
export function useCreateLobbyOrInvite(gameType: string, invitePath: string) {
    const [seatCount, setSeatCount] = useState(0);
    const router = useRouter();
    const { showToast } = useToast();

    const submit = async <T extends IInvitationRequest>(data: T) => {
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

    return { seatCount, setSeatCount, submit };
}
