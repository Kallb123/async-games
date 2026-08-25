'use client'

import { IGameResponse } from "@/utils/apiModels/GameDataApi";
import Link from "next/link";
import { useState } from "react";
import { opponents } from "@/utils/ui/players";
import { gamePath } from "@/utils/ui/games";
import ListSection from "@/components/ui/ListSection";
import { TURN_LIST_EVENTS } from "@/utils/hooks/usePushEvents";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { useIsAuthorised } from "@/utils/hooks/useAuthGuard";
import { formatRemainingTimeShort } from "@/utils/games/TurnTimer";
import { useNowToTheMinute } from "@/utils/hooks/useNow";
import { useToast } from "@/components/ToastContext";

export default function TheirTurnList() {
    const { user } = useIsAuthorised();
    const { showToast } = useToast();
    const now = useNowToTheMinute();
    const [nudgedGameIds, setNudgedGameIds] = useState(new Set<string>());
    const { data, isLoading, isRefreshing } = useRefreshableData<{ gameList: IGameResponse[] }>(
        '/api/game/theirturnlist',
        TURN_LIST_EVENTS,
    );

    const gameList = data?.gameList ?? [];

    const handleNudge = (gameId: string, opponentName: string) => {
        setNudgedGameIds(prev => new Set(prev).add(gameId));
        fetch('/api/game/nudge', {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId })
        })
        .then(response => {
            // A 429 means the nudge went out already (one per game per hour —
            // see the nudge route). The button stays spent, because retrying is
            // exactly what the limit is there to stop.
            if (response.status === 429) {
                showToast(`You've already nudged ${opponentName} about this game — give them an hour.`, 'success', 'Already nudged');
                return;
            }
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

    return (
        <ListSection
            label="Waiting on others"
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            skeletonAvatar={false}
            hint="Use 👉 to send a nudge to move things along"
        >
            {gameList.map((game) => {
                const timeLeft = formatRemainingTimeShort(game.lastTurnTimestamp, game.turnTimer, now);
                const opponentName = game.currentTurnUsername || opponents(game, user?.username, "them");
                const alreadyNudged = nudgedGameIds.has(game.gameId);
                return (
                    <div key={game.gameId} className="ag-list-row">
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "oklch(0.7 0.05 60)", flex: "none" }} />
                        <Link href={gamePath(game.url, game.gameId)} className="ag-list-row-main">
                            <div style={{ font: "600 13px/1.35 var(--ag-font)" }}>
                                {game.friendlyName} · <span style={{ color: "var(--ag-ink-soft)" }}>{opponentName}&apos;s turn</span>
                            </div>
                        </Link>
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
        </ListSection>
    );
}
