'use client'

import type { ICompletedGame } from "@/app/api/game/mycompletelist/route";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePushEvents, COMPLETED_GAME_EVENTS } from "@/utils/hooks/usePushEvents";

export default function MyCompleteList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [gameList, setGameList] = useState([] as ICompletedGame[]);

    useEffect(() => {
        refreshContent();
    }, [isLoaded]);

    usePushEvents(COMPLETED_GAME_EVENTS, () => refreshContent(), { refreshOnVisible: true });

    const refreshContent = async () => {
        if (isLoaded) {
            if (!user) {
                router.push('/login');
            }
            const unlocked = user?.publicMetadata.unlocked;
            if (unlocked !== true) {
                router.push('/unlockaccess');
            }

            fetch('/api/game/mycompletelist')
            .then(response => response.json())
            .then(data => {if (data && data.gameList) setGameList(data.gameList)})
            .catch(error => console.error('Failed to load complete games', error));
        }
    }

    if (gameList.length === 0) return null;

    return (
        <div className="ag-section">
            <div className="ag-section-head">
                <h2 className="ag-section-label">Finished</h2>
            </div>
            <div className="ag-list">
                {gameList.map((game) => {
                    const iWon = game.winner && game.winner === user?.username;
                    return (
                        <button
                            key={game.gameId}
                            type="button"
                            className="ag-list-row ag-list-row--button"
                            onClick={() => router.push(`/games/result/${game.gameId}`)}
                        >
                            <div style={{ font: "600 13px/1.35 var(--ag-font)", flex: 1, minWidth: 0 }}>
                                {game.friendlyName} — <strong style={{ fontWeight: 800, color: iWon ? "var(--ag-green)" : "var(--ag-ink)" }}>
                                    {game.winner ? `${game.winner} won` : "complete"}
                                </strong>
                            </div>
                            {iWon ? <span style={{ fontSize: 15 }}>🏆</span> : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
