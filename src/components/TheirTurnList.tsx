'use client'

import { IGameResponse } from "@/utils/apiModels/GameDataApi";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { opponents } from "@/utils/ui/players";
import { SkeletonList } from "@/components/ui/Skeleton";
import { usePushEvents, TURN_ADVANCED_EVENTS } from "@/utils/hooks/usePushEvents";

const THEIR_TURN_EVENTS = ['NewInvite', 'GameStart', ...TURN_ADVANCED_EVENTS];

export default function TheirTurnList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [gameList, setGameList] = useState([] as IGameResponse[]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        refreshContent();
    }, [isLoaded]);

    usePushEvents(THEIR_TURN_EVENTS, () => refreshContent(), { refreshOnVisible: true });

    const refreshContent = async () => {
        if (isLoaded) {
            if (!user) {
                router.push('/login');
            }
            const unlocked = user?.publicMetadata.unlocked;
            if (unlocked !== true) {
                router.push('/unlockaccess');
            }

            fetch('/api/game/theirturnlist')
            .then(response => response.json())
            .then(data => {if (data && data.gameList) setGameList(data.gameList)})
            .catch(error => console.error('Failed to load their turn list', error))
            .finally(() => setIsLoading(false));
        }
    }

    const handleEndGame = async (gameId: `${string}-${string}-${string}-${string}-${string}`) => {
        fetch('/api/game/end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId })
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to end game');
            return response.json();
        })
        .then(() => refreshContent())
        .catch(error => console.error('Failed to end game', error));
    }

    if (gameList.length === 0) return isLoading ? <SkeletonList rows={2} avatar={false} label /> : null;

    return (
        <div className="ag-section">
            <div className="ag-section-head">
                <h2 className="ag-section-label">Waiting on others</h2>
            </div>
            <div className="ag-list">
                {gameList.map((game) => (
                    <div key={game.gameId} className="ag-list-row">
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(0.7 0.05 60)", flex: "none" }} />
                        <a
                            href={`/games/${game.url}/${game.gameId}`}
                            className="ag-list-row-main"
                            style={{ textDecoration: "none", color: "var(--ag-ink)" }}
                        >
                            <div style={{ font: "600 13px/1.35 var(--ag-font)" }}>
                                {game.friendlyName} · <span style={{ color: "var(--ag-ink-soft)" }}>{game.currentTurnUsername || opponents(game, user?.username, "them")}&apos;s turn</span>
                            </div>
                        </a>
                        <button type="button" className="ag-link-muted" onClick={() => handleEndGame(game.gameId)}>End</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
