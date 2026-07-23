import type { GameResultStatGroup } from "@/utils/apiModels/GameDataApi";

interface GameResultStatsProps {
    groups: GameResultStatGroup[];
}

// Renders a GameResult's formatted, game-specific stat groups (e.g. "earned
// 100 coins", "solved in 5 guesses"). Shared by the recent-form popup and the
// full result page.
export default function GameResultStats({ groups }: GameResultStatsProps) {
    if (groups.length === 0) return null;

    return (
        <div className="ag-list">
            {groups.map((group, i) => (
                <div key={group.username ?? i} className="ag-list-row" style={{ alignItems: "flex-start" }}>
                    <div className="ag-list-row-main">
                        {group.username && <div className="ag-list-row-title">{group.username}</div>}
                        {group.lines.map((line, j) => (
                            <div key={j} className="ag-list-row-sub">{line}</div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
