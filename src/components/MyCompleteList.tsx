'use client'

import type { ICompletedGame } from "@/utils/apiModels/GameDataApi";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ListSection from "@/components/ui/ListSection";
import type { RefreshableState } from "@/utils/hooks/useRefreshableData";
import { useIsAuthorised } from "@/utils/hooks/useAuthGuard";
import { abandonedGameCopy } from "@/utils/ui/players";

interface MyCompleteListProps extends RefreshableState {
    games: ICompletedGame[];
    /** Caps the rows shown and adds a "See all" link to the full page. Omit for the full, unlimited list. */
    limit?: number;
}

export default function MyCompleteList({ games, isLoading, isRefreshing, limit }: MyCompleteListProps) {
    const { user } = useIsAuthorised();
    const router = useRouter();

    const visibleGames = limit ? games.slice(0, limit) : games;

    return (
        <ListSection
            label="Finished"
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            skeletonAvatar={false}
            action={limit && games.length > limit
                ? <Link href="/games/completed" className="ag-section-action">See all</Link>
                : undefined}
        >
            {visibleGames.map((game) => {
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
                                {game.winner
                                    ? `${game.winner} won`
                                    : game.endReason === 'abandoned' ? abandonedGameCopy(game.forfeitedBy).short : "complete"}
                            </strong>
                        </div>
                        {iWon ? <span style={{ fontSize: 15 }}>🏆</span> : null}
                    </button>
                );
            })}
        </ListSection>
    );
}
