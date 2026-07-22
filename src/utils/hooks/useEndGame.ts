import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

// Ends (surrenders) a game via the shared /api/game/end endpoint, then returns
// the player to the dashboard. Used by the in-game options menu so every game
// surrenders the same way. Confirms first, since ending a game can't be undone.
export function useEndGame(gameId: string) {
    const router = useRouter();
    const [ending, setEnding] = useState(false);

    const endGame = useCallback(async () => {
        if (ending) return;
        if (!window.confirm("End this game for everyone? This can't be undone.")) return;
        setEnding(true);
        try {
            const res = await fetch("/api/game/end", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gameId }),
            });
            if (!res.ok) throw new Error("Failed to end game");
            router.push("/");
        } catch (error) {
            console.error("Failed to end game", error);
            setEnding(false);
        }
    }, [gameId, ending, router]);

    return { endGame, ending };
}
