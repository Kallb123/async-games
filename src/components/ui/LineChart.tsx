'use client'

import { useMemo, useState } from "react";
import type { GameResultChart } from "@/utils/apiModels/GameDataApi";
import { playerColour } from "@/utils/ui/playerColours";

interface LineChartProps {
    chart: GameResultChart;
    /** Usernames in player order, so each line's colour matches that
     * player's colour everywhere else in the game (board, scoreboard, recap). */
    players: string[];
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

// Rounds up to a "clean" axis max (1/2/5 * 10^n), so gridline ticks read as
// round numbers rather than whatever the highest series value happens to be.
function niceMax(max: number): number {
    if (max <= 0) return 10;
    const exponent = Math.floor(Math.log10(max));
    const fraction = max / 10 ** exponent;
    const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
    return niceFraction * 10 ** exponent;
}

// Turn-by-turn line chart for the GameResult page: turn number on the
// x-axis, one line per player. Generic over any game's GameResultChart, so
// every game can plug its own per-turn series into the same component.
export default function LineChart({ chart, players }: LineChartProps) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [showTable, setShowTable] = useState(false);

    const turnCount = chart.turns.length;
    const series = useMemo(() => players.map((name, i) => ({
        name,
        color: playerColour(i),
        values: chart.turns.map(turn => turn[name] ?? 0),
    })), [players, chart.turns]);

    if (turnCount === 0 || series.length === 0) return null;

    const maxValue = Math.max(0, ...series.flatMap(s => s.values));
    const top = niceMax(maxValue);
    const xStep = turnCount > 1 ? PLOT_WIDTH / (turnCount - 1) : 0;
    const xAt = (i: number) => PAD_LEFT + (turnCount > 1 ? i * xStep : PLOT_WIDTH / 2);
    const yAt = (v: number) => PAD_TOP + PLOT_HEIGHT - (v / top) * PLOT_HEIGHT;
    const gridValues = [0, top / 2, top];

    // End-of-line value labels, nudged apart vertically when two players'
    // final values are close enough that the labels would collide.
    const endLabels = series
        .map(s => ({ name: s.name, color: s.color, value: s.values[s.values.length - 1], y: yAt(s.values[s.values.length - 1]) }))
        .sort((a, b) => a.y - b.y)
        .reduce<{ name: string; color: string; value: number; y: number }[]>((acc, s) => {
            const prevY = acc.length ? acc[acc.length - 1].y : -Infinity;
            acc.push({ ...s, y: Math.max(s.y, prevY + MIN_LABEL_GAP) });
            return acc;
        }, []);

    function handlePointer(clientX: number, rect: DOMRect) {
        const fraction = (clientX - rect.left) / rect.width;
        const svgX = fraction * VB_WIDTH;
        const idx = turnCount > 1 ? Math.round((svgX - PAD_LEFT) / xStep) : 0;
        setHoverIndex(Math.min(turnCount - 1, Math.max(0, idx)));
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
                    <text className="ag-chart-tick" x={xAt(0)} y={VB_HEIGHT - 6} textAnchor="start">Turn 1</text>
                    {turnCount > 1 && (
                        <text className="ag-chart-tick" x={xAt(turnCount - 1)} y={VB_HEIGHT - 6} textAnchor="end">Turn {turnCount}</text>
                    )}

                    {series.map(s => (
                        <path
                            key={s.name}
                            className="ag-chart-line"
                            d={s.values.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(v)}`).join(" ")}
                            style={{ stroke: s.color }}
                        />
                    ))}

                    {series.map(s => (
                        <circle
                            key={`dot-${s.name}`}
                            className="ag-chart-enddot"
                            cx={xAt(turnCount - 1)}
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
                                    key={`hover-${s.name}`}
                                    className="ag-chart-hoverdot"
                                    cx={xAt(hoverIndex)}
                                    cy={yAt(s.values[hoverIndex])}
                                    r={4}
                                    style={{ fill: s.color }}
                                />
                            ))}
                        </>
                    )}
                </svg>

                {endLabels.map(l => (
                    <div
                        key={l.name}
                        className="ag-chart-endlabel"
                        style={{ left: `${(xAt(turnCount - 1) / VB_WIDTH) * 100}%`, top: `${(l.y / VB_HEIGHT) * 100}%`, color: l.color }}
                    >
                        {l.value}
                    </div>
                ))}

                {hoverIndex !== null && (
                    <div className="ag-chart-tooltip" style={{ left: `${(xAt(hoverIndex) / VB_WIDTH) * 100}%` }}>
                        <div className="ag-chart-tooltip-turn">Turn {hoverIndex + 1}</div>
                        {series.map(s => (
                            <div key={s.name} className="ag-chart-tooltip-row">
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
                    <span key={s.name} className="ag-chart-legend-item">
                        <span className="ag-chart-legend-dot" style={{ background: s.color }} />
                        {s.name}
                    </span>
                ))}
            </div>

            <button type="button" className="ag-chart-table-toggle" onClick={() => setShowTable(v => !v)}>
                {showTable ? "Hide turn-by-turn table" : "Show turn-by-turn table"}
            </button>
            {showTable && (
                <div className="ag-chart-table-wrap">
                    <table className="ag-chart-table">
                        <thead>
                            <tr>
                                <th>Turn</th>
                                {players.map(name => <th key={name}>{name}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {chart.turns.map((turn, i) => (
                                <tr key={i}>
                                    <td>{i + 1}</td>
                                    {players.map(name => <td key={name}>{turn[name] ?? 0}</td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
