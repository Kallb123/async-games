'use client'

import { useMemo, useState } from "react";
import type { GameResultChart, GameResultChartSeries } from "@/utils/apiModels/GameDataApi";
import { playerColour } from "@/utils/ui/playerColours";
import ChartEventIcon, { CHART_EVENT_ICON_SIZE } from "./ChartEventIcon";

interface LineChartProps {
    chart: GameResultChart;
    /** Usernames in player order, so each line's colour matches that
     * player's colour everywhere else in the game (board, scoreboard, recap).
     * Ignored by a chart that names its own series. */
    players: string[];
    /** The players' stable userIds, in the same order as `players`. A
     * per-player chart's per-round series are keyed by these, so a shared
     * display name can't collapse two players onto one line. */
    playerIds: string[];
}

const VB_WIDTH = 320;
const VB_HEIGHT = 200;
const PAD_LEFT = 30;
const PAD_RIGHT = 10;
const PAD_TOP = 14;
const PAD_BOTTOM = 24;
const PLOT_WIDTH = VB_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = VB_HEIGHT - PAD_TOP - PAD_BOTTOM;
const MIN_LABEL_GAP = 13;

// Rounds up to a "clean" axis max (1/2/3/5 * 10^n), so gridline ticks read as
// round numbers rather than whatever the highest series value happens to be.
// The 3 is there because without it everything from 21 to 50 shares an axis
// top of 50 — which left Outbreak's 24-cube supplies drawn in the bottom half
// of an axis half of which nothing could ever reach.
function niceMax(max: number): number {
    if (max <= 0) return 10;
    const exponent = Math.floor(Math.log10(max));
    const fraction = max / 10 ** exponent;
    const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 3 ? 3 : fraction <= 5 ? 5 : 10;
    return niceFraction * 10 ** exponent;
}

// Round-by-round line chart for the GameResult page: round number on the
// x-axis, one line per player — or, when the chart names its own series
// (GameResultChart.series), one line per whatever the game is plotting
// instead. Generic over any game's GameResultChart, so every game can plug its
// own per-round series into the same component.
export default function LineChart({ chart, players, playerIds }: LineChartProps) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [showTable, setShowTable] = useState(false);

    const roundCount = chart.rounds.length;
    const series = useMemo(() => {
        const lines: GameResultChartSeries[] = chart.series
            ?? players.map((name, i) => ({ key: playerIds[i], name, color: playerColour(i) }));
        return lines.map(line => ({
            ...line,
            values: chart.rounds.map(round => round[line.key] ?? 0),
        }));
    }, [players, playerIds, chart.series, chart.rounds]);

    if (roundCount === 0 || series.length === 0) return null;

    const maxValue = Math.max(0, ...series.flatMap(s => s.values));
    const top = niceMax(maxValue);
    const xStep = roundCount > 1 ? PLOT_WIDTH / (roundCount - 1) : 0;
    const xAt = (i: number) => PAD_LEFT + (roundCount > 1 ? i * xStep : PLOT_WIDTH / 2);
    const yAt = (v: number) => PAD_TOP + PLOT_HEIGHT - (v / top) * PLOT_HEIGHT;
    const gridValues = [0, top / 2, top];

    // Event markers (epidemics, landmark buys, explosions — see
    // GameResultEvent): pinned to the round they happened in and, when the
    // event names a line (seriesKey), to that line's value there and to that
    // line's colour, so a landmark reads as this player's landmark at a
    // glance. An event with no line of its own (Outbreak's epidemic touches
    // the whole board, not one disease colour) floats above the plot in the
    // page's own ink instead. Stacked when two land on the same round so
    // neither is hidden behind the other.
    const roundOccupancy = new Map<number, number>();
    const eventMarkers = (chart.events ?? []).map(event => {
        const stackIndex = roundOccupancy.get(event.round) ?? 0;
        roundOccupancy.set(event.round, stackIndex + 1);
        const line = event.seriesKey ? series.find(s => s.key === event.seriesKey) : undefined;
        const baseY = line ? yAt(line.values[event.round]) : PAD_TOP;
        return {
            ...event,
            color: line?.color,
            x: xAt(event.round),
            y: Math.max(PAD_TOP + 6, baseY - 8 - stackIndex * CHART_EVENT_ICON_SIZE),
        };
    });

    // End-of-line value labels, nudged apart vertically when two players'
    // final values are close enough that the labels would collide.
    const endLabels = series
        .map(s => ({ key: s.key, name: s.name, color: s.color, value: s.values[s.values.length - 1], y: yAt(s.values[s.values.length - 1]) }))
        .sort((a, b) => a.y - b.y)
        .reduce<{ key: string; name: string; color: string; value: number; y: number }[]>((acc, s) => {
            const prevY = acc.length ? acc[acc.length - 1].y : -Infinity;
            acc.push({ ...s, y: Math.max(s.y, prevY + MIN_LABEL_GAP) });
            return acc;
        }, []);

    function handlePointer(clientX: number, rect: DOMRect) {
        const fraction = (clientX - rect.left) / rect.width;
        const svgX = fraction * VB_WIDTH;
        const idx = roundCount > 1 ? Math.round((svgX - PAD_LEFT) / xStep) : 0;
        setHoverIndex(Math.min(roundCount - 1, Math.max(0, idx)));
    }

    return (
        <div className="ag-chart">
            <div className="ag-chart-ylabel">{chart.yLabel}</div>

            <div className="ag-chart-plot">
                <svg
                    className="ag-chart-svg"
                    viewBox={`0 0 ${VB_WIDTH} ${VB_HEIGHT}`}
                    onPointerMove={e => handlePointer(e.clientX, e.currentTarget.getBoundingClientRect())}
                    onPointerDown={e => handlePointer(e.clientX, e.currentTarget.getBoundingClientRect())}
                    onPointerUp={() => setHoverIndex(null)}
                    onPointerLeave={() => setHoverIndex(null)}
                >
                    {gridValues.map(v => (
                        <line key={v} className="ag-chart-grid" x1={PAD_LEFT} x2={VB_WIDTH - PAD_RIGHT} y1={yAt(v)} y2={yAt(v)} />
                    ))}
                    {gridValues.map(v => (
                        <text key={`t${v}`} className="ag-chart-tick" x={PAD_LEFT - 5} y={yAt(v)} textAnchor="end" dominantBaseline="middle">
                            {Math.round(v)}
                        </text>
                    ))}
                    <text className="ag-chart-tick" x={xAt(0)} y={VB_HEIGHT - 6} textAnchor="start">Round 1</text>
                    {roundCount > 1 && (
                        <text className="ag-chart-tick" x={xAt(roundCount - 1)} y={VB_HEIGHT - 6} textAnchor="end">Round {roundCount}</text>
                    )}

                    {series.map(s => (
                        <path
                            key={s.key}
                            className="ag-chart-line"
                            d={s.values.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(v)}`).join(" ")}
                            style={{ stroke: s.color }}
                        />
                    ))}

                    {series.map(s => (
                        <circle
                            key={`dot-${s.key}`}
                            className="ag-chart-enddot"
                            cx={xAt(roundCount - 1)}
                            cy={yAt(s.values[s.values.length - 1])}
                            r={4}
                            style={{ fill: s.color }}
                        />
                    ))}

                    {hoverIndex !== null && (
                        <>
                            <line
                                className="ag-chart-crosshair"
                                x1={xAt(hoverIndex)} x2={xAt(hoverIndex)}
                                y1={PAD_TOP} y2={PAD_TOP + PLOT_HEIGHT}
                            />
                            {series.map(s => (
                                <circle
                                    key={`hover-${s.key}`}
                                    className="ag-chart-hoverdot"
                                    cx={xAt(hoverIndex)}
                                    cy={yAt(s.values[hoverIndex])}
                                    r={4}
                                    style={{ fill: s.color }}
                                />
                            ))}
                        </>
                    )}

                    {eventMarkers.map((m, i) => (
                        <ChartEventIcon key={`event-${i}`} icon={m.icon} x={m.x} y={m.y} color={m.color} title={m.title} />
                    ))}
                </svg>

                {endLabels.map(l => (
                    <div
                        key={l.key}
                        className="ag-chart-endlabel"
                        style={{ left: `${(xAt(roundCount - 1) / VB_WIDTH) * 100}%`, top: `${(l.y / VB_HEIGHT) * 100}%`, color: l.color }}
                    >
                        {l.value}
                    </div>
                ))}

                {hoverIndex !== null && (
                    <div className="ag-chart-tooltip" style={{ left: `${(xAt(hoverIndex) / VB_WIDTH) * 100}%` }}>
                        <div className="ag-chart-tooltip-round">Round {hoverIndex + 1}</div>
                        {series.map(s => (
                            <div key={s.key} className="ag-chart-tooltip-row">
                                <span className="ag-chart-tooltip-key" style={{ background: s.color }} />
                                <span className="ag-chart-tooltip-name">{s.name}</span>
                                <span className="ag-chart-tooltip-value">{s.values[hoverIndex]}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="ag-chart-legend">
                {series.map(s => (
                    <span key={s.key} className="ag-chart-legend-item">
                        <span className="ag-chart-legend-dot" style={{ background: s.color }} />
                        {s.name}
                    </span>
                ))}
            </div>

            <button type="button" className="ag-chart-table-toggle" onClick={() => setShowTable(v => !v)}>
                {showTable ? "Hide round-by-round table" : "Show round-by-round table"}
            </button>
            {showTable && (
                <div className="ag-chart-table-wrap">
                    <table className="ag-chart-table">
                        <thead>
                            <tr>
                                <th>Round</th>
                                {series.map(s => <th key={s.key}>{s.name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {chart.rounds.map((round, i) => (
                                <tr key={i}>
                                    <td>{i + 1}</td>
                                    {series.map(s => <td key={s.key}>{s.values[i]}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
