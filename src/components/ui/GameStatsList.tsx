'use client'

import GameThumb from "@/components/ui/GameThumb";
import ListSection from "@/components/ui/ListSection";
import { GAME_META } from "@/utils/ui/games";
import { pluralize } from "@/utils/ui/text";
import type { IGameStats } from "@/app/api/stats/route";

const THUMB_SIZE = 36;

interface GameStatsListProps {
    label: string;
    stats: IGameStats[];
    isLoading: boolean;
    isRefreshing?: boolean;
}

// Per-game W/L/D breakdown list. Shared by a player's own profile ("Stats by
// game") and a friend's read-only profile ("Match history") - same data
// shape, different section label.
export default function GameStatsList({ label, stats, isLoading, isRefreshing }: GameStatsListProps) {
    return (
        <ListSection label={label} isLoading={isLoading} isRefreshing={isRefreshing}>
            {stats.map(stat => {
                const meta = GAME_META[stat.url];
                return (
                    <div key={stat.url} className="ag-list-row">
                        {meta
                            ? <GameThumb meta={meta} size={THUMB_SIZE} radius={10} />
                            : <div style={{ width: THUMB_SIZE, height: THUMB_SIZE, flex: "none" }} />}
                        <div className="ag-list-row-main">
                            <div className="ag-list-row-title">{meta?.name ?? stat.url}</div>
                            <div className="ag-list-row-sub">{pluralize(stat.total, 'match', 'matches')}</div>
                        </div>
                        <div style={{ font: "800 12.5px var(--ag-font)", whiteSpace: "nowrap" }}>
                            <span className="ag-outcome-text--win">{stat.wins}W</span>
                            {" · "}
                            <span className="ag-outcome-text--loss">{stat.losses}L</span>
                            {" · "}
                            <span className="ag-outcome-text--draw">{stat.draws}D</span>
                        </div>
                    </div>
                );
            })}
        </ListSection>
    );
}
