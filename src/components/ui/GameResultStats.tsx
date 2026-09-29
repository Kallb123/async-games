import type { CSSProperties, ReactNode } from "react";
import type { GameResultStatGroup } from "@/utils/apiModels/GameDataApi";
import { playerColour } from "@/utils/ui/playerColours";

interface GameResultStatsProps {
    groups: GameResultStatGroup[];
    /** The result's usernames in seat order, so each player's row wears their
     *  seat colour down its side — the same colour as their line on the charts. */
    players: string[];
}

/**
 * A GameResult's formatted, game-specific stat groups (e.g. "earned 100
 * coins", "solved in 5 guesses") as `ag-list-row`s, without the `ag-list`
 * card round them — for a caller that owns that card itself, like the result
 * page's `ListSection`.
 */
export function gameResultStatRows(groups: GameResultStatGroup[], players: string[]): ReactNode[] {
    return groups.map((group, i) => {
        // A group that isn't one player's (no username, or a name not at the
        // table) stays plain rather than borrowing somebody's colour.
        const seat = group.username ? players.indexOf(group.username) : -1;
        return (
            <div
                key={group.username ?? i}
                className={`ag-list-row${seat >= 0 ? " ag-list-row--player" : ""}`}
                style={{ alignItems: "flex-start", ...(seat >= 0 && { "--ag-row-accent": playerColour(seat) }) } as CSSProperties}
            >
                <div className="ag-list-row-main">
                    {group.username && <div className="ag-list-row-title">{group.username}</div>}
                    {group.lines.map((line, j) => (
                        <div key={j} className="ag-list-row-sub">{line}</div>
                    ))}
                </div>
            </div>
        );
    });
}

// The same stat groups as a finished `ag-list` card, for the recent-form
// popup — where there is no section around them to provide one.
export default function GameResultStats({ groups, players }: GameResultStatsProps) {
    if (groups.length === 0) return null;

    return <div className="ag-list">{gameResultStatRows(groups, players)}</div>;
}
