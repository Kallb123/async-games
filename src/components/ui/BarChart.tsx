import type { GameResultBarChart } from "@/utils/apiModels/GameDataApi";
import { playerChartSeries } from "@/utils/ui/playerColours";
import ChartLegend from "./ChartLegend";

interface BarChartProps {
    chart: GameResultBarChart;
    /** Usernames in player order — names and colours a stacked bar's
     * segments, as on LineChart. Unused by a chart with no segments. */
    players: string[];
    /** The players' stable userIds, parallel to `players`: the keys a bar's
     * `segments` are recorded against. */
    playerIds: string[];
}

// A frequency-distribution chart for the GameResult page: a fixed category
// per bar (not a round number) and a count on the y-axis — Settlements &
// Cities' dice roll frequency is the first of these. Plain CSS bars rather
// than LineChart's SVG plot, since there's no hover-by-round crosshair to
// draw here, just one bar per category. The bar sizes itself against
// `.ag-barchart-track` — the room left once the category label and the value
// have taken theirs — so the tallest bar fills the track exactly rather than
// overflowing the column and being squashed back to fit. The value rides on
// top of its own bar, so it can't take height off the one it labels.
//
// A bar that records its `segments` is stacked: each player's share in their
// own colour, first seat at the bottom, with a legend underneath naming them.
// The total on top is unchanged, so the stack only adds who rolled it.
export default function BarChart({ chart, players, playerIds }: BarChartProps) {
    if (chart.bars.length === 0) return null;
    const maxValue = Math.max(1, ...chart.bars.map(b => b.value));
    const stacked = chart.bars.some(b => b.segments);
    const series = stacked ? playerChartSeries(players, playerIds) : [];

    return (
        <div className="ag-chart">
            <div className="ag-chart-ylabel">{chart.yLabel}</div>
            <div className="ag-barchart-plot">
                {chart.bars.map(bar => (
                    <div key={bar.label} className="ag-barchart-col">
                        <div className="ag-barchart-track">
                            <div className="ag-barchart-bar" style={{ height: `${(bar.value / maxValue) * 100}%` }}>
                                {bar.segments && bar.value > 0 && (
                                    <div className="ag-barchart-stack">
                                        {series.map(s => {
                                            const count = bar.segments?.[s.key] ?? 0;
                                            return count > 0 && (
                                                <div
                                                    key={s.key}
                                                    className="ag-barchart-segment"
                                                    title={`${s.name}: ${count}`}
                                                    style={{ flexGrow: count, background: s.color }}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                                <div className="ag-barchart-value">{bar.value}</div>
                            </div>
                        </div>
                        <div className="ag-barchart-label">{bar.label}</div>
                    </div>
                ))}
            </div>
            {stacked && <ChartLegend series={series} />}
        </div>
    );
}
