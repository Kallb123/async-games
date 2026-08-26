import type { ReactNode } from "react";
import type { GameResultStatGroup } from "@/utils/apiModels/GameDataApi";

interface GameResultStatsProps {
    groups: GameResultStatGroup[];
}

/**
 * A GameResult's formatted, game-specific stat groups (e.g. "earned 100
 * coins", "solved in 5 guesses") as `ag-list-row`s, without the `ag-list`
 * card round them — for a caller that owns that card itself, like the result
 * page's `ListSection`.
 */
export function gameResultStatRows(groups: GameResultStatGroup[]): ReactNode[] {
    return groups.map((group, i) => (
        <div key={group.username ?? i} className="ag-list-row" style={{ alignItems: "flex-start" }}>
            <div className="ag-list-row-main">
                {group.username && <div className="ag-list-row-title">{group.username}</div>}
                {group.lines.map((line, j) => (
                    <div key={j} className="ag-list-row-sub">{line}</div>
                ))}
            </div>
        </div>
    ));
}

// The same stat groups as a finished `ag-list` card, for the recent-form
// popup — where there is no section around them to provide one.
export default function GameResultStats({ groups }: GameResultStatsProps) {
    if (groups.length === 0) return null;

    return <div className="ag-list">{gameResultStatRows(groups)}</div>;
}
