'use client'

import GameThumb from "@/components/ui/GameThumb";
import ListRow from "@/components/ui/ListRow";
import ListSection from "@/components/ui/ListSection";
import { worldBuildsStorageKey, type KingdomBuilderWorldSummary } from "@/games/KingdomBuilder/worldSummaryTypes";
import type { RefreshableState } from "@/utils/hooks/useRefreshableData";
import { useHydrated } from "@/utils/hooks/useNow";
import { useStoredValue } from "@/utils/hooks/useStoredValue";
import { GAME_META } from "@/utils/ui/games";

interface KingdomBuilderWorldListProps extends RefreshableState {
    worlds: KingdomBuilderWorldSummary[];
}

const META = GAME_META.kingdombuilder;

function WorldRow({ world }: { world: KingdomBuilderWorldSummary }) {
    const hydrated = useHydrated();
    const storageKey = worldBuildsStorageKey(world.worldId);
    const [seenLevels, setSeenLevels] = useStoredValue(storageKey);
    const previousLevels = seenLevels === null ? world.completedBuildLevels : Number(seenLevels);
    const finished = Number.isFinite(previousLevels) ? Math.max(0, world.completedBuildLevels - previousLevels) : 0;

    return <ListRow
        href={`/kingdombuilder/${world.worldId}`}
        onClick={() => setSeenLevels(String(world.completedBuildLevels))}
        icon={<GameThumb meta={META} size={38} radius={9} />}
        title={META.name}
        sub={`Tick ${world.currentTick} · ${world.settlementCount} ${world.settlementCount === 1 ? "settlement" : "settlements"}${finished > 0 ? ` · ${finished} ${finished === 1 ? "build" : "builds"} finished` : ""}`}
        action={hydrated ? <span className="ag-list-row-time">Next tick {new Date(world.nextTickAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> : undefined}
    />;
}

export default function KingdomBuilderWorldList({ worlds, isLoading, isRefreshing }: KingdomBuilderWorldListProps) {
    return (
        <ListSection label="Your worlds" isLoading={isLoading} isRefreshing={isRefreshing} skeletonIcon="thumb">
            {worlds.map(world => (
                <WorldRow key={world.worldId} world={world} />
            ))}
        </ListSection>
    );
}
