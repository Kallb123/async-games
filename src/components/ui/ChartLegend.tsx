import type { GameResultChartSeries } from "@/utils/apiModels/GameDataApi";

interface ChartLegendProps {
    series: GameResultChartSeries[];
}

// The row of colour-dot-and-name keys under a GameResult chart — one per line
// on a LineChart, one per stacked segment on a BarChart.
export default function ChartLegend({ series }: ChartLegendProps) {
    return (
        <div className="ag-chart-legend">
            {series.map(s => (
                <span key={s.key} className="ag-chart-legend-item">
                    <span className="ag-chart-legend-dot" style={{ background: s.color }} />
                    {s.name}
                </span>
            ))}
        </div>
    );
}
