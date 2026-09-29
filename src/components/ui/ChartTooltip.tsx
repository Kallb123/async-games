import type { ReactNode } from "react";

export interface ChartTooltipRow {
    key: string;
    name: string;
    color: string;
    value: number;
}

interface ChartTooltipProps {
    /** Where along the plot the tooltip points, as a percentage of its width. */
    left: number;
    /** What the rows are a breakdown of — the round, the bar. */
    title: ReactNode;
    rows: ChartTooltipRow[];
}

// The dark hover card over a GameResult chart: a title, then one keyed row per
// series — every line's value at the hovered round on a LineChart, every
// player's share of the hovered bar on a BarChart. Shifted along by as much of
// its own width as `left` is of the plot's, so it sits centred mid-plot and
// hangs inwards at either end rather than off the edge of the column.
export default function ChartTooltip({ left, title, rows }: ChartTooltipProps) {
    return (
        <div className="ag-chart-tooltip" style={{ left: `${left}%`, transform: `translateX(-${left}%)` }}>
            <div className="ag-chart-tooltip-title">{title}</div>
            {rows.map(row => (
                <div key={row.key} className="ag-chart-tooltip-row">
                    <span className="ag-chart-tooltip-key" style={{ background: row.color }} />
                    <span className="ag-chart-tooltip-name">{row.name}</span>
                    <span className="ag-chart-tooltip-value">{row.value}</span>
                </div>
            ))}
        </div>
    );
}
