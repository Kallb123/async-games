import type { GameResultBarChart } from "@/utils/apiModels/GameDataApi";

interface BarChartProps {
    chart: GameResultBarChart;
}

// A frequency-distribution chart for the GameResult page: a fixed category
// per bar (not a round number) and a count on the y-axis — Settlements &
// Cities' dice roll frequency is the first of these. Plain CSS bars rather
// than LineChart's SVG plot, since there's no hover-by-round crosshair or
// per-player series to draw here, just one bar per category.
export default function BarChart({ chart }: BarChartProps) {
    if (chart.bars.length === 0) return null;
    const maxValue = Math.max(1, ...chart.bars.map(b => b.value));

    return (
        <div className="ag-chart">
            <div className="ag-chart-ylabel">{chart.yLabel}</div>
            <div className="ag-barchart-plot">
                {chart.bars.map(bar => (
                    <div key={bar.label} className="ag-barchart-col">
                        <div className="ag-barchart-value">{bar.value}</div>
                        <div className="ag-barchart-bar" style={{ height: `${(bar.value / maxValue) * 100}%` }} />
                        <div className="ag-barchart-label">{bar.label}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
