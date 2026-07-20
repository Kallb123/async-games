import { SNAKES_AND_LADDERS_LADDERS, SNAKES_AND_LADDERS_SNAKES } from "@/utils/apiModels/GameLogic";
import { ISnakesAndLaddersPlayerStateResponse } from "@/games/SnakesAndLadders/apiModels";

interface SnakesAndLaddersBoardProps {
    playerStates: { [key: string]: ISnakesAndLaddersPlayerStateResponse };
    /** Colour per player, keyed by userId — shared with the scoreboard. */
    colorFor: (userId: string) => string;
    /** The viewer's userId, so their token/legend can be highlighted. */
    myUserId?: string;
}

/**
 * The 100-square walnut board: a boustrophedon 10×10 grid (square 1 bottom-left,
 * 100 top-left) with ladder/snake markers and each player's token sitting on
 * their current square. Purely presentational — position data comes from state.
 */
export default function SnakesAndLaddersBoard({ playerStates, colorFor, myUserId }: SnakesAndLaddersBoardProps) {
    const players = Object.values(playerStates);

    const tokensOnSquare = (square: number) => players.filter(p => p.position === square);

    const cellClass = (square: number): string => {
        if (square === 100) return "ag-sl-cell ag-sl-cell--finish";
        if (SNAKES_AND_LADDERS_LADDERS[square] !== undefined) return "ag-sl-cell ag-sl-cell--ladder ag-sl-cell--marker";
        if (SNAKES_AND_LADDERS_SNAKES[square] !== undefined) return "ag-sl-cell ag-sl-cell--snake ag-sl-cell--marker";
        return "ag-sl-cell";
    };

    const cellIcon = (square: number): string | null => {
        if (square === 100) return "🏁";
        if (SNAKES_AND_LADDERS_LADDERS[square] !== undefined) return "🪜";
        if (SNAKES_AND_LADDERS_SNAKES[square] !== undefined) return "🐍";
        return null;
    };

    // Where a ladder climbs to / a snake slides down to, shown on the tile.
    const cellDest = (square: number): number | null => {
        if (SNAKES_AND_LADDERS_LADDERS[square] !== undefined) return SNAKES_AND_LADDERS_LADDERS[square];
        if (SNAKES_AND_LADDERS_SNAKES[square] !== undefined) return SNAKES_AND_LADDERS_SNAKES[square];
        return null;
    };

    const me = myUserId ? players.find(p => p.userId === myUserId) : undefined;

    const cells = [];
    // Render the top row (91–100) first down to the bottom row (1–10); numbering
    // snakes back and forth so consecutive squares stay adjacent.
    for (let row = 9; row >= 0; row--) {
        for (let col = 0; col < 10; col++) {
            const square = row % 2 === 0 ? row * 10 + col + 1 : row * 10 + (9 - col) + 1;
            const icon = cellIcon(square);
            const dest = cellDest(square);
            const here = tokensOnSquare(square);
            cells.push(
                <div key={square} className={cellClass(square)}>
                    {icon ? <span className="ag-sl-cell-icon">{icon}</span> : <span className="ag-sl-cell-num">{square}</span>}
                    {dest !== null && <span className="ag-sl-cell-dest">→{dest}</span>}
                    {here.length > 0 && (
                        <span className="ag-sl-tokens">
                            {here.map(p => (
                                <span key={p.userId} className="ag-sl-token" style={{ background: colorFor(p.userId) }} title={p.username} />
                            ))}
                        </span>
                    )}
                </div>
            );
        }
    }

    return (
        <div className="ag-sl-area">
            <div className="ag-sl-frame">
                <div className="ag-sl-grid">{cells}</div>
            </div>
            <div className="ag-sl-legend">
                <span>🪜 climb up</span>
                <span>🐍 slide down</span>
                {me && (
                    <span>
                        <span className="ag-sl-legend-dot" style={{ background: colorFor(me.userId) }} />
                        you · sq {me.position}
                    </span>
                )}
            </div>
        </div>
    );
}
