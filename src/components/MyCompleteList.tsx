'use client'

import type { ICompletedGame } from "@/utils/apiModels/GameDataApi";
import Link from "next/link";
import ListSection from "@/components/ui/ListSection";
import type { RefreshableState } from "@/utils/hooks/useRefreshableData";
import { useIsAuthorised } from "@/utils/hooks/useAuthGuard";
import { finishedGameCopy } from "@/utils/ui/players";
import { resultPath } from "@/utils/ui/games";

interface MyCompleteListProps extends Pick<RefreshableState, "isLoading"> {
    /** The full /games/completed list shimmers its rows while it refetches; the
     *  dashboard leaves this out and shows its one loading bar instead. */
    isRefreshing?: boolean;
    games: ICompletedGame[];
    /** Caps the rows shown and adds a "See all" link to the full page. Omit for the full, unlimited list. */
    limit?: number;
}

export default function MyCompleteList({ games, isLoading, isRefreshing, limit }: MyCompleteListProps) {
    const { user } = useIsAuthorised();

    const myUserId = user?.id;

    const visibleGames = limit ? games.slice(0, limit) : games;

    return (
        // Shape mirrored (label, icon, row count) in app/loading.tsx's homepage
        // skeleton — keep the two in sync if this changes.
        <ListSection
            label="Finished"
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            skeletonRows={4}
            skeletonIcon="dot"
            action={limit && games.length > limit
                ? <Link href="/games/completed" className="ag-section-action">See all</Link>
                : undefined}
        >
            {visibleGames.map((game) => {
                // A co-op table wins together, so every player at one gets the
                // trophy; otherwise you won iff the winner's id is yours.
                const iWon = game.endReason === 'teamwin' || (!!game.winnerId && game.winnerId === myUserId);
                return (
                    <Link
                        key={game.gameId}
                        href={resultPath(game.gameId)}
                        className="ag-list-row"
                    >
                        <div style={{ font: "600 13px/1.35 var(--ag-font)", flex: 1, minWidth: 0 }}>
                            {game.friendlyName} — <strong style={{ fontWeight: 800, color: iWon ? "var(--ag-green)" : "var(--ag-ink)" }}>
                                {finishedGameCopy(game) ?? "complete"}
                            </strong>
                        </div>
                        {iWon ? <span style={{ fontSize: 15 }}>🏆</span> : null}
                    </Link>
                );
            })}
        </ListSection>
    );
}
