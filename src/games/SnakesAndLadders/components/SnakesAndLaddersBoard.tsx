import { SNAKES_AND_LADDERS_LADDERS, SNAKES_AND_LADDERS_SNAKES } from "@/utils/apiModels/GameLogic";
import { ISnakesAndLaddersPlayerStateResponse } from "@/games/SnakesAndLadders/apiModels";
import { SL_GRID, SL_LADDER_ART, SL_SNAKE_ART, squareAt } from "@/games/SnakesAndLadders/ui";

const LADDER_TOPS = new Set(Object.values(SNAKES_AND_LADDERS_LADDERS));
const SNAKE_TAILS = new Set(Object.values(SNAKES_AND_LADDERS_SNAKES));

interface SnakesAndLaddersBoardProps {
    playerStates: { [key: string]: ISnakesAndLaddersPlayerStateResponse };
    /** Colour per player, keyed by userId — shared with the scoreboard. */
    colorFor: (userId: string) => string;
    /** The viewer's userId, so their token/legend can be highlighted. */
    myUserId?: string;
}

/**
 * The 100-square walnut board: a boustrophedon 10×10 grid (square 1 bottom-left,
 * 100 top-left) with the ladders and snakes drawn across it as an SVG layer, and
 * each player's token sitting on their current square. Purely presentational —
 * position data comes from state, the shapes come from `ui.ts`.
 */
export default function SnakesAndLaddersBoard({ playerStates, colorFor, myUserId }: SnakesAndLaddersBoardProps) {
    const players = Object.values(playerStates);

    const tokensOnSquare = (square: number) => players.filter(p => p.position === square);

    const cellClass = (square: number): string => {
        if (square === 100) return "ag-sl-cell ag-sl-cell--finish";
        if (SNAKES_AND_LADDERS_LADDERS[square] !== undefined) return "ag-sl-cell ag-sl-cell--ladder";
        if (SNAKES_AND_LADDERS_SNAKES[square] !== undefined) return "ag-sl-cell ag-sl-cell--snake";
        if (LADDER_TOPS.has(square)) return "ag-sl-cell ag-sl-cell--ladder-top";
        if (SNAKE_TAILS.has(square)) return "ag-sl-cell ag-sl-cell--snake-tail";
        return "ag-sl-cell";
    };

    const me = myUserId ? players.find(p => p.userId === myUserId) : undefined;

    const cells = [];
    // Render the top row (91–100) first down to the bottom row (1–10); numbering
    // snakes back and forth so consecutive squares stay adjacent.
    for (let row = SL_GRID - 1; row >= 0; row--) {
        for (let col = 0; col < SL_GRID; col++) {
            const square = squareAt(row, col);
            const here = tokensOnSquare(square);
            cells.push(
                <div key={square} className={cellClass(square)}>
                    {square === 100
                        ? <span className="ag-sl-cell-icon">🏁</span>
                        : <span className="ag-sl-cell-num">{square}</span>}
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
                <div className="ag-sl-grid">
                    {cells}
                    {/* Drawn over the squares (tokens sit above it again) so a
                        ladder or snake reads as one continuous run between the
                        two squares it joins. */}
                    <svg className="ag-sl-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                        {SL_LADDER_ART.map(ladder => (
                            <g key={`ladder-${ladder.from}`}>
                                {ladder.rungs.map((rung, i) => (
                                    <line key={i} {...rung} className="ag-sl-ladder-rung" />
                                ))}
                                {ladder.rails.map((rail, i) => (
                                    <line key={i} {...rail} className="ag-sl-ladder-rail" />
                                ))}
                            </g>
                        ))}
                        {SL_SNAKE_ART.map(snake => (
                            <g key={`snake-${snake.from}`}>
                                <path d={snake.body} className="ag-sl-snake-body" />
                                <g transform={`rotate(${snake.headAngle} ${snake.head.x} ${snake.head.y})`}>
                                    <ellipse cx={snake.head.x} cy={snake.head.y} rx="2.7" ry="2.1" className="ag-sl-snake-head" />
                                    <circle cx={snake.head.x + 1.05} cy={snake.head.y - 0.85} r="0.42" className="ag-sl-snake-eye" />
                                    <circle cx={snake.head.x + 1.05} cy={snake.head.y + 0.85} r="0.42" className="ag-sl-snake-eye" />
                                </g>
                            </g>
                        ))}
                    </svg>
                </div>
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
