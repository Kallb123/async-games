import { SNAKES_AND_LADDERS_LADDERS, SNAKES_AND_LADDERS_SNAKES } from "@/utils/apiModels/GameLogic";
import { ISnakesAndLaddersPlayerStateResponse } from "@/games/SnakesAndLadders/apiModels";

interface SnakesAndLaddersBoardProps {
    playerStates: { [key: string]: ISnakesAndLaddersPlayerStateResponse }
}

const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

export default function SnakesAndLaddersBoard({ playerStates }: SnakesAndLaddersBoardProps) {
    const players = Object.values(playerStates);

    const getPlayersOnSquare = (square: number) => {
        return players.filter(p => p.position === square);
    };

    const getCellStyle = (square: number): React.CSSProperties => {
        if (SNAKES_AND_LADDERS_LADDERS[square] !== undefined) {
            return { backgroundColor: "#d5f5e3", border: "2px solid #27ae60" };
        }
        if (SNAKES_AND_LADDERS_SNAKES[square] !== undefined) {
            return { backgroundColor: "#fadbd8", border: "2px solid #e74c3c" };
        }
        return { border: "1px solid #bdc3c7" };
    };

    const getCellLabel = (square: number): string => {
        if (SNAKES_AND_LADDERS_LADDERS[square] !== undefined) {
            return `🪜→${SNAKES_AND_LADDERS_LADDERS[square]}`;
        }
        if (SNAKES_AND_LADDERS_SNAKES[square] !== undefined) {
            return `🐍→${SNAKES_AND_LADDERS_SNAKES[square]}`;
        }
        return "";
    };

    const renderBoard = () => {
        const rows = [];
        for (let row = 9; row >= 0; row--) {
            const cells = [];
            for (let col = 0; col < 10; col++) {
                // Alternate direction of numbering per row (snake pattern)
                const squareNumber = row % 2 === 0
                    ? row * 10 + col + 1
                    : row * 10 + (9 - col) + 1;

                const playersHere = getPlayersOnSquare(squareNumber);

                cells.push(
                    <td key={squareNumber} style={{
                        width: "9%",
                        height: "60px",
                        textAlign: "center",
                        verticalAlign: "middle",
                        fontSize: "0.7rem",
                        padding: "2px",
                        ...getCellStyle(squareNumber)
                    }}>
                        <div style={{ fontWeight: "bold", fontSize: "0.75rem" }}>{squareNumber}</div>
                        <div style={{ fontSize: "0.65rem", color: "#555" }}>{getCellLabel(squareNumber)}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2px" }}>
                            {playersHere.map((p, i) => (
                                <span
                                    key={p.userId}
                                    title={p.username}
                                    style={{
                                        display: "inline-block",
                                        width: "14px",
                                        height: "14px",
                                        borderRadius: "50%",
                                        backgroundColor: PLAYER_COLORS[players.indexOf(p) % PLAYER_COLORS.length],
                                        border: "1px solid #333"
                                    }}
                                />
                            ))}
                        </div>
                    </td>
                );
            }
            rows.push(<tr key={row}>{cells}</tr>);
        }
        return rows;
    };

    return (
        <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <tbody>
                    {renderBoard()}
                </tbody>
            </table>
            <div style={{ marginTop: "8px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                {players.map((p, i) => (
                    <span key={p.userId} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.85rem" }}>
                        <span style={{
                            display: "inline-block",
                            width: "14px",
                            height: "14px",
                            borderRadius: "50%",
                            backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
                            border: "1px solid #333"
                        }} />
                        {p.username} (sq. {p.position})
                    </span>
                ))}
            </div>
        </div>
    );
}
