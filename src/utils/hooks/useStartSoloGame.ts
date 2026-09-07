'use client'
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastContext";
import { gamePath } from "@/utils/ui/games";

/**
 * Starting a solo game, which is three requests rather than one.
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
    const router = useRouter();
    const { showToast } = useToast();

    const start = async (data: unknown) => {
        if (starting) return;
        setStarting(true);

        try {
            const createResponse = await fetch(invitePath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!createResponse.ok) {
                throw new Error('Failed to start game');
            }
            const { inviteId } = await createResponse.json();

            // Solo game: nobody else to accept, so this completes immediately.
            const acceptResponse = await fetch('/api/invite/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteId })
            });
            if (!acceptResponse.ok) {
                throw new Error('Failed to deal the game');
            }
            const { gameStarted, gameId, gameUrl } = await acceptResponse.json();
            if (!gameStarted) {
                throw new Error('Game did not start');
            }
            router.push(gamePath(gameUrl, gameId));
        } catch (error) {
            console.error(error);
            showToast('Failed to start the game. Please try again.', 'danger');
            setStarting(false);
        }
    };

    return { starting, start };
}
