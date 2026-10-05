import type { GameResultTable } from "@/utils/apiModels/GameDataApi";
import { rosterChartSeries } from "@/utils/ui/playerColours";

interface ResultTableProps {
    table: GameResultTable;
    /** Usernames in player order — the column headers. */
    players: string[];
    /** The players' stable userIds, parallel to `players`: the keys each
     * row's `values` are recorded against. */
    playerIds: string[];
}

// A GameResultTable on the GameResult page: a row per thing counted, a column
// per player and then any the table adds after them, and each row's highest
// count in bold — every column that shares it, and nobody on a row where no
// one scored. Wears LineChart's round-by-round table styling, so the page has
// one table look.
export default function ResultTable({ table, players, playerIds }: ResultTableProps) {
    if (table.rows.length === 0) return null;
    const columns = rosterChartSeries(players, playerIds, table.extraSeries);

    return (
        <div className="ag-chart-table-wrap">
            <table className="ag-chart-table">
                <thead>
                    <tr>
                        <th>{table.rowLabel}</th>
                        {columns.map(column => <th key={column.key}>{column.name}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {table.rows.map(row => {
                        const values = columns.map(column => row.values[column.key] ?? 0);
                        const best = Math.max(...values);
                        return (
                            <tr key={row.label}>
                                <td>{row.label}</td>
                                {values.map((value, i) => (
                                    <td key={columns[i].key} className={best > 0 && value === best ? "ag-chart-table-best" : undefined}>
                                        {value}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
