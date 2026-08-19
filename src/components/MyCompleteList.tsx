'use client'

import type { ICompletedGame } from "@/app/api/game/mycompletelist/route";
import { useRouter } from "next/navigation";
import ListSection from "@/components/ui/ListSection";
import { COMPLETED_GAME_EVENTS } from "@/utils/hooks/usePushEvents";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";
import { useIsAuthorised } from "@/utils/hooks/useAuthGuard";
import { abandonedGameCopy } from "@/utils/ui/players";

export default function MyCompleteList() {
    const { user } = useIsAuthorised();
    const router = useRouter();
    const { data, isLoading, isRefreshing } = useRefreshableData<{ gameList: ICompletedGame[] }>(
        '/api/game/mycompletelist',
        COMPLETED_GAME_EVENTS,
    );

    const gameList = data?.gameList ?? [];

    return (
        <ListSection
            label="Finished"
            isLoading={isLoading}
            isRefreshing={isRefreshing}
            skeletonAvatar={false}
        >
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
