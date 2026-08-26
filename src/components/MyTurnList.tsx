'use client'

import { IGameResponse } from "@/utils/apiModels/GameDataApi";
import { useRouter } from "next/navigation";
import { gamePath, metaForGame } from "@/utils/ui/games";
import { opponents } from "@/utils/ui/players";
import GameThumb from "@/components/ui/GameThumb";
import { accentVar } from "@/utils/ui/colours";
import CollapsingSection from "@/components/ui/CollapsingSection";
import Refreshable from "@/components/ui/Refreshable";
import { SkeletonTurnCard } from "@/components/ui/Skeleton";
import type { RefreshableState } from "@/utils/hooks/useRefreshableData";
import useAnimatedList from "@/utils/hooks/useAnimatedList";
import { useIsAuthorised } from "@/utils/hooks/useAuthGuard";
import { formatRemainingTimeShort } from "@/utils/games/TurnTimer";
import { useNowToTheMinute } from "@/utils/hooks/useNow";

interface MyTurnListProps extends RefreshableState {
    games: IGameResponse[];
}

export default function MyTurnList({ games, isLoading, isRefreshing }: MyTurnListProps) {
    const { user } = useIsAuthorised();
    const router = useRouter();
    const now = useNowToTheMinute();

    const count = games.length;

    // Cards still on screen — a game you have just played stays until it has
    // finished shrinking away, and the two placeholder cards shown while the
    // dashboard loads hand over to the real ones without moving anything that
    // has a card to become.
    const cards = useAnimatedList(games.map((game) => {
        const meta = metaForGame({ url: game.url, friendlyName: game.friendlyName });
        const accent = meta ? accentVar(meta.accent) : "var(--ag-terracotta)";
        const timeLeft = formatRemainingTimeShort(game.lastTurnTimestamp, game.turnTimer, now);
        return (
            <div
                key={game.gameId}
                className="ag-turn-card"
                style={{ background: accent, cursor: "pointer" }}
                onClick={() => router.push(gamePath(game.url, game.gameId))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") router.push(gamePath(game.url, game.gameId)); }}
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
    }), { isLoading, placeholder: { node: <SkeletonTurnCard />, count: 1 } });

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

            {cards.length > 0 && (
                <CollapsingSection collapsed={!isLoading && count === 0} isLoading={isLoading}>
                    <Refreshable className="ag-stack" isRefreshing={isRefreshing}>{cards}</Refreshable>
                </CollapsingSection>
            )}
        </>
    );
}
