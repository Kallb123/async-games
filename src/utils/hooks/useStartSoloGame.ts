'use client'
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastContext";
import { gamePath } from "@/utils/ui/games";

/**
 * Starting a solo game, which is two requests rather than one.
 *
 * A solo game still goes through the invite/accept engine — docs/new-game.md's
 * solo gotcha is explicit that it must not fork it — so the setup screen
 * creates an invitation with nobody in it, accepts that invitation itself
 * (`userIdList: []` makes `/api/invite/accept`'s "has everyone accepted?"
 * check vacuously true, so the game is dealt on the very first call), and goes
 * straight to the board. Nothing about that sequence is per-game, which is why
 * it lives here: Solitaire wrote it first and Fires Out's solitaire mode
 * (docs/games/fires-out-gdd.md §17.6 step 12) is the second caller, so the two
 * share it rather than keeping a copy each.
 *
 * `starting` is both the button's label state and its own re-entry guard — a
 * second submit while the first is in flight would deal a second game.
 */
export function useStartSoloGame(invitePath: string) {
    const [starting, setStarting] = useState(false);
    // The invitation this screen has already created, if the sequence got that
    // far. A failure after the invitation exists — the accept timing out, or
    // its response not making it home — must not create a *second* one on the
    // retry, or the player ends up with two games and only asked for one.
    // Re-accepting the same id is safe: `acceptSeat` answers a request that
    // lost the race with the game the invitation became.
    const pendingInvite = useRef<string | null>(null);
    const router = useRouter();
    const { showToast } = useToast();

    const start = async (data: unknown) => {
        if (starting) return;
        setStarting(true);

        try {
            if (!pendingInvite.current) {
                const createResponse = await fetch(invitePath, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                    // A connection that opens and then stalls never rejects on
                    // its own, which would leave `starting` set and the button
                    // dead until the player reloads the page.
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                });
                if (!createResponse.ok) {
                    throw new Error('Failed to start game');
                }
                const { inviteId } = await createResponse.json();
                if (!inviteId) {
                    throw new Error('No invitation to accept');
                }
                pendingInvite.current = inviteId;
            }

            // Solo game: nobody else to accept, so this completes immediately.
            const acceptResponse = await fetch('/api/invite/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteId: pendingInvite.current }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (!acceptResponse.ok) {
                throw new Error('Failed to deal the game');
            }
            const { gameStarted, gameId, gameUrl } = await acceptResponse.json();
            if (!gameStarted) {
                throw new Error('Game did not start');
            }
            pendingInvite.current = null;
            router.push(gamePath(gameUrl, gameId));
        } catch (error) {
            console.error(error);
            showToast('Failed to start the game. Please try again.', 'danger');
            setStarting(false);
        }
    };

    return { starting, start };
}

// Generous for a write that creates a document, short enough that a dead
// connection gives the button back rather than stranding it on "starting…".
const REQUEST_TIMEOUT_MS = 20_000;
