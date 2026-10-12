'use client'

import { IGameResponse } from "@/utils/apiModels/GameDataApi";
import GameLink from "@/components/ui/GameLink";
import { gamePath, metaForGame } from "@/utils/ui/games";
import { opponentsById } from "@/utils/ui/players";
import GameThumb from "@/components/ui/GameThumb";
import UnreadChatBadge from "@/components/ui/UnreadChatBadge";
import { accentVar } from "@/utils/ui/colours";
import CollapsingSection from "@/components/ui/CollapsingSection";
import { SkeletonTurnCard } from "@/components/ui/Skeleton";
import useAnimatedList from "@/utils/hooks/useAnimatedList";
import { useIsAuthorised } from "@/utils/hooks/useAuthGuard";
import { formatRemainingTimeShort } from "@/utils/games/TurnTimer";
import { useNowToTheMinute } from "@/utils/hooks/useNow";

interface MyTurnListProps {
    isLoading: boolean;
    games: IGameResponse[];
}

export default function MyTurnList({ games, isLoading }: MyTurnListProps) {
    const { user } = useIsAuthorised();
    const now = useNowToTheMinute();

    const myUserId = user?.id;

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
            <GameLink
                key={game.gameId}
                gameId={game.gameId}
                href={gamePath(game.url, game.gameId)}
                className="ag-turn-card"
                style={{ background: accent }}
            >
                <div className="ag-turn-card-head">
                    {meta
                        ? <GameThumb meta={meta} size={52} radius={12} />
                        : <div style={{ width: 52 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ag-turn-card-title">{game.friendlyName}</div>
                        <div className="ag-turn-card-sub">vs {opponentsById(game, myUserId)}</div>
                    </div>
                </div>
                <div className="ag-turn-card-cta" style={{ color: accent }}>
                    Take your turn
                </div>
                {(timeLeft || (game.unreadChatCount ?? 0) > 0) && (
                    <div className="ag-turn-card-badges">
                        <UnreadChatBadge count={game.unreadChatCount ?? 0} onDark />
                        {timeLeft && <div className="ag-turn-card-badge">{timeLeft}</div>}
                    </div>
                )}
            </GameLink>
        );
    }), { isLoading, placeholder: { node: <SkeletonTurnCard />, count: 1 } });

    return (
        <>
            <div className="ag-hero">
                <h1 className="ag-hero-title">
                    {/* The space before the break is what the heading reads
                        as on a wide screen, where `ag-theme.css` hides the
                        break and puts the line back together. */}
                    {count > 0 ? <>It&apos;s your <br />move{count > 1 ? ` ×${count}` : ""}</> : "All caught up"}
                </h1>
                <p className="ag-hero-sub">
                    {count > 0
                        ? "These games are waiting on you."
                        : "No turns to take right now — start something new below."}
                </p>
            </div>

            {cards.length > 0 && (
                <CollapsingSection collapsed={!isLoading && count === 0} isLoading={isLoading}>
                    <div className="ag-stack">{cards}</div>
                </CollapsingSection>
            )}
        </>
    );
}
