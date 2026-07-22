'use client'

import { IGameResponse } from "@/utils/apiModels/GameDataApi";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { metaForGame } from "@/utils/ui/games";
import { opponents } from "@/utils/ui/players";
import GameThumb, { accentVar } from "@/components/ui/GameThumb";
import { SkeletonTurnCards } from "@/components/ui/Skeleton";
import { usePushEvents, TURN_ADVANCED_EVENTS } from "@/utils/hooks/usePushEvents";
import { formatRemainingTimeShort } from "@/utils/games/TurnTimer";

const MY_TURN_EVENTS = ['NewInvite', 'GameStart', ...TURN_ADVANCED_EVENTS];

export default function MyTurnList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [gameList, setGameList] = useState([] as IGameResponse[]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        refreshContent();
    }, [isLoaded]);

    usePushEvents(MY_TURN_EVENTS, () => refreshContent(), { refreshOnVisible: true });

    const refreshContent = async () => {
        if (isLoaded) {
            if (!user) {
                router.push('/login');
            }
            const unlocked = user?.publicMetadata.unlocked;
            if (unlocked !== true) {
                router.push('/unlockaccess');
            }

            setIsLoading(true);
            fetch('/api/game/myturnlist')
            .then(response => response.json())
            .then(data => {if (data && data.gameList) setGameList(data.gameList)})
            .catch(error => console.error('Failed to load my turn list', error))
            .finally(() => setIsLoading(false));
        }
    }

    const count = gameList.length;

    return (
        <>
            <div className="ag-hero">
                <h1 className="ag-hero-title">
                    {count > 0 ? <>It&apos;s your<br />move{count > 1 ? ` ×${count}` : ""}</> : "All caught up"}
                </h1>
                <p className="ag-hero-sub">
                    {count > 0
                        ? "These games are waiting on you."
                        : "No turns to take right now — start something new below."}
                </p>
            </div>

            {isLoading && count === 0 && <SkeletonTurnCards count={2} />}

            {count > 0 && (
                <div className="ag-section">
                    <div className="ag-stack">
                        {gameList.map((game) => {
                            const meta = metaForGame({ url: game.url, friendlyName: game.friendlyName });
                            const accent = meta ? accentVar(meta.accent) : "var(--ag-terracotta)";
                            const timeLeft = formatRemainingTimeShort(game.lastTurnTimestamp, game.turnTimer);
                            return (
                                <div
                                    key={game.gameId}
                                    className="ag-turn-card"
                                    style={{ background: accent, cursor: "pointer" }}
                                    onClick={() => router.push(`/games/${game.url}/${game.gameId}`)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => { if (e.key === "Enter") router.push(`/games/${game.url}/${game.gameId}`); }}
                                >
                                    <div className="ag-turn-card-head">
                                        {meta
                                            ? <GameThumb meta={meta} size={52} radius={12} />
                                            : <div style={{ width: 52 }} />}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="ag-turn-card-title">{game.friendlyName}</div>
                                            <div className="ag-turn-card-sub">vs {opponents(game, user?.username)}</div>
                                        </div>
                                    </div>
                                    <div className="ag-turn-card-cta" style={{ color: accent }}>
                                        Take your turn
                                    </div>
                                    {timeLeft && <div className="ag-turn-card-badge">{timeLeft}</div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
}
