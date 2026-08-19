'use client'

import { use } from "react";
import GameThumb from "@/components/ui/GameThumb";
import BackLink from "@/components/ui/BackLink";
import GameResultStats from "@/components/ui/GameResultStats";
import LineChart from "@/components/ui/LineChart";
import { SkeletonList } from "@/components/ui/Skeleton";
import { useGameResult } from "@/utils/hooks/useGameResult";
import { GAME_META } from "@/utils/ui/games";
import { abandonedGameCopy } from "@/utils/ui/players";
import { pluralize } from "@/utils/ui/text";
import moment from 'moment';

export default function GameResultPage({ params }: { params: Promise<{ gameId: string }> }) {
    const { gameId } = use(params);
    const { result, isLoading, error } = useGameResult(gameId);
    const meta = result ? GAME_META[result.url] : undefined;

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <BackLink href="/" label="Back home" />
                    <span className="ag-wordmark">Result</span>
                </div>
            </div>

            {isLoading
                ? <SkeletonList rows={3} avatar={false} />
                : (error || !result)
                ? (
                    <div className="ag-section">
                        <div className="ag-empty">{error ?? "Couldn't load this game's result."}</div>
                    </div>
                )
                : (
                    <>
                        <div className="ag-section">
                            <div className="ag-list">
                                <div className="ag-list-row">
                                    {meta
                                        ? <GameThumb meta={meta} size={44} radius={12} />
                                        : <div style={{ width: 44, height: 44, flex: "none" }} />}
                                    <div className="ag-list-row-main">
                                        <div className="ag-list-row-title">{meta?.name ?? result.url}</div>
                                        <div className="ag-list-row-sub">
                                            {result.winner
                                                ? `${result.winner} won`
                                                : result.endReason === 'abandoned'
                                                    ? abandonedGameCopy(result.forfeitedBy).short
                                                    : "Draw"} · {moment(result.endedAt).fromNow()} · {pluralize(result.totalTurns, 'turn')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="ag-section">
                            <div className="ag-section-head">
                                <h2 className="ag-section-label">Stats</h2>
                            </div>
                            {result.stats.length > 0
                                ? <GameResultStats groups={result.stats} />
                                : <div className="ag-empty">No extra stats recorded for this game.</div>}
                        </div>

                        {result.charts.map(chart => (
                            <div className="ag-section" key={chart.title}>
                                <div className="ag-section-head">
                                    <h2 className="ag-section-label">{chart.title}</h2>
                                </div>
                                <LineChart chart={chart} players={result.players} />
                            </div>
                        ))}
                    </>
                )}

        </main>
    );
}
