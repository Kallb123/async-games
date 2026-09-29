'use client'

import { useState } from "react";
import type { GameResultBarChart } from "@/utils/apiModels/GameDataApi";
import { playerChartSeries } from "@/utils/ui/playerColours";
import ChartLegend from "./ChartLegend";
import ChartTooltip from "./ChartTooltip";

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
// Hovering one (or pressing it, on a phone) brings up its breakdown — each
// player's count in that bar — in the same card LineChart shows for a round.
export default function BarChart({ chart, players, playerIds }: BarChartProps) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    if (chart.bars.length === 0) return null;
    const maxValue = Math.max(1, ...chart.bars.map(b => b.value));
    const stacked = chart.bars.some(b => b.segments);
    const series = stacked ? playerChartSeries(players, playerIds) : [];
    const hovered = hoverIndex !== null ? chart.bars[hoverIndex] : null;
    const hover = (i: number) => () => setHoverIndex(chart.bars[i].segments ? i : null);

    return (
        <div className="ag-chart">
            <div className="ag-chart-ylabel">{chart.yLabel}</div>
            <div
                className={`ag-barchart-plot${hovered ? " ag-barchart-plot--hovering" : ""}`}
                onPointerLeave={() => setHoverIndex(null)}
            >
                {chart.bars.map((bar, i) => (
                    <div
                        key={bar.label}
                        className={`ag-barchart-col${i === hoverIndex ? " ag-barchart-col--hovered" : ""}`}
                        onPointerEnter={hover(i)}
                        onPointerDown={hover(i)}
                    >
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
                {hoverIndex !== null && hovered && (
                    <ChartTooltip
                        left={((hoverIndex + 0.5) / chart.bars.length) * 100}
                        title={`${hovered.label} — ${hovered.value} total`}
                        rows={series.map(s => ({ ...s, value: hovered.segments?.[s.key] ?? 0 }))}
                    />
                )}
            </div>
            {stacked && <ChartLegend series={series} />}
        </div>
    );
}
