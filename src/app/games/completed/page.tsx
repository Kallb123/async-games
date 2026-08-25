'use client'
import { usePathname } from "next/navigation";
import BackLink from "@/components/ui/BackLink";
import MyCompleteList from "@/components/MyCompleteList";
import type { ICompletedGame } from "@/utils/apiModels/GameDataApi";
import { COMPLETED_GAME_EVENTS } from "@/utils/hooks/usePushEvents";
import { useRefreshableData } from "@/utils/hooks/useRefreshableData";

// The full history, which the home screen only shows the top of. It reads the
// finished games on their own rather than the whole dashboard — the other four
// lists would be fetched and thrown away — and both come from the same builders
// (see src/utils/dashboard.ts).
export default function CompletedGames() {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { data, isLoading, isRefreshing } = useRefreshableData<{ gameList: ICompletedGame[] }>(
        '/api/game/mycompletelist',
        COMPLETED_GAME_EVENTS,
    );

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <BackLink href="/" label="Back home" />
                    <span className="ag-wordmark">Completed games</span>
                </div>
            </div>

            <MyCompleteList games={data?.gameList ?? []} isLoading={isLoading} isRefreshing={isRefreshing} />
        </main>
    );
}
