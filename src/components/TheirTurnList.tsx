'use client'

import { IGameResponse } from "@/utils/apiModels/GameDataApi";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { opponents } from "@/utils/ui/players";
import { SkeletonList } from "@/components/ui/Skeleton";
import { usePushEvents, TURN_ADVANCED_EVENTS } from "@/utils/hooks/usePushEvents";
import { formatRemainingTimeShort } from "@/utils/games/TurnTimer";
import { useToast } from "@/components/ToastContext";

const THEIR_TURN_EVENTS = ['NewInvite', 'GameStart', ...TURN_ADVANCED_EVENTS];

export default function TheirTurnList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const { showToast } = useToast();
    const [gameList, setGameList] = useState([] as IGameResponse[]);
    const [isLoading, setIsLoading] = useState(true);
    const [nudgedGameIds, setNudgedGameIds] = useState(new Set<string>());

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

    const handleNudge = (gameId: string, opponentName: string) => {
        setNudgedGameIds(prev => new Set(prev).add(gameId));
        fetch('/api/game/nudge', {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId })
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to send nudge');
            showToast(`Sent a nudge to ${opponentName}.`, 'success', 'Nudge sent');
        })
        .catch(() => {
            showToast('Failed to send the nudge. Please try again.', 'danger');
            setNudgedGameIds(prev => {
                const next = new Set(prev);
                next.delete(gameId);
                return next;
            });
        });
    }

    if (gameList.length === 0) return isLoading ? <SkeletonList rows={2} avatar={false} label /> : null;

    return (
        <div className="ag-section">
            <div className="ag-section-head">
                <h2 className="ag-section-label">Waiting on others</h2>
            </div>
            <div className="ag-list">
                {gameList.map((game) => {
                    const timeLeft = formatRemainingTimeShort(game.lastTurnTimestamp, game.turnTimer);
                    const opponentName = game.currentTurnUsername || opponents(game, user?.username, "them");
                    const alreadyNudged = nudgedGameIds.has(game.gameId);
                    return (
                        <div key={game.gameId} className="ag-list-row">
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(0.7 0.05 60)", flex: "none" }} />
                            <a
                                href={`/games/${game.url}/${game.gameId}`}
                                className="ag-list-row-main"
                                style={{ textDecoration: "none", color: "var(--ag-ink)" }}
                            >
                                <div style={{ font: "600 13px/1.35 var(--ag-font)" }}>
                                    {game.friendlyName} · <span style={{ color: "var(--ag-ink-soft)" }}>{opponentName}&apos;s turn</span>
                                </div>
                            </a>
                            {timeLeft && <span className="ag-list-row-time">{timeLeft}</span>}
                            <button
                                type="button"
                                className="ag-pill-action"
                                aria-label={`Nudge ${opponentName}`}
                                disabled={alreadyNudged}
                                onClick={() => handleNudge(game.gameId, opponentName)}
                            >
                                👉
                            </button>
                        </div>
                    );
                })}
            </div>
            <p className="ag-hint">Use 👉 to send a nudge to move things along</p>
        </div>
    );
}
