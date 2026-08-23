'use client'
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastContext";
import { gamePath } from "@/utils/ui/games";

/**
 * Announce that a game has just started and send the player to its board.
 *
 * Three screens land a player on a brand-new game — accepting an invite from
 * the home dashboard, entering a join code, and a host watching their lobby's
 * last seat fill — and they all owe the player the same toast and the same
 * destination, so the pair lives here rather than in three copies.
 */
export function useEnterStartedGame(): (gameUrl: string, gameId: string) => void {
    const router = useRouter();
    const { showToast } = useToast();

    return (gameUrl: string, gameId: string) => {
        showToast('Game is starting! Redirecting you now...', 'success', 'Game Started');
        router.push(gamePath(gameUrl, gameId));
    };
}
