'use client'

import { use, useState } from "react";
import GameThumb, { ROW_THUMB_RADIUS, ROW_THUMB_SIZE } from "@/components/ui/GameThumb";
import BackLink from "@/components/ui/BackLink";
import ListRow from "@/components/ui/ListRow";
import ListSection from "@/components/ui/ListSection";
import Section from "@/components/ui/Section";
import { gameResultStatRows } from "@/components/ui/GameResultStats";
import LineChart from "@/components/ui/LineChart";
import BarChart from "@/components/ui/BarChart";
import ResultTable from "@/components/ui/ResultTable";
import { useGameResult } from "@/utils/hooks/useGameResult";
import { useToast } from "@/components/ToastContext";
import type { IGameResultResponse } from "@/utils/api/gameResultResponse";
import { GAME_META } from "@/utils/ui/games";
import { finishedGameCopy } from "@/utils/ui/players";
import { pluralize } from "@/utils/ui/text";
import { lengthUnit } from "@/utils/games/turnCount";
import moment from 'moment';

export default function GameResultPage({ params }: { params: Promise<{ gameId: string }> }) {
    const { gameId } = use(params);
    const { result, isLoading, error, replaceResult } = useGameResult(gameId);
    const meta = result ? GAME_META[result.url] : undefined;
    // A result that never arrived has nothing to lay out — the one state that
    // isn't the page in some stage of filling in.
    const failed = !isLoading && !result;

    return (
        <main>
            <div className="ag-topbar">
                <div className="ag-topbar-title">
                    <BackLink href="/" label="Back home" />
                    <span className="ag-wordmark">Result</span>
                </div>
            </div>

            {failed ? (
                <Section>
                    <div className="ag-empty">{error ?? "Couldn't load this game's result."}</div>
                </Section>
            ) : (<>
                {/* Both sections are the shape they will be once the result lands —
                    one summary row, then the stats — so the placeholders hand over
                    in place instead of a generic list of rows blinking out for a
                    different page. The charts are the one thing we can't stand in
                    for: how many there are, and how tall, is the game's business. */}
                <ListSection isLoading={isLoading} skeletonRows={1} skeletonIcon="thumb">
                    {result && (
                        <ListRow
                            key={result.url}
                            icon={meta ? <GameThumb meta={meta} size={ROW_THUMB_SIZE} radius={ROW_THUMB_RADIUS} /> : undefined}
                            title={meta?.name ?? result.url}
                            sub={<>
                                {finishedGameCopy(result) ?? "Draw"} · {moment(result.endedAt).fromNow()} · {pluralize(result.totalTurns, lengthUnit(result.playerIds.length))}
                            </>}
                        />
                    )}
                </ListSection>

                <ListSection
                    label="Stats"
                    isLoading={isLoading}
                    skeletonIcon="none"
                    empty={<div className="ag-empty">No extra stats recorded for this game.</div>}
                >
                    {result ? gameResultStatRows(result.stats) : null}
                </ListSection>

                {result?.charts.map(chart => (
                    <Section label={chart.title} key={chart.title}>
                        {chart.kind === 'bar'
                            ? <BarChart chart={chart} players={result.players} playerIds={result.playerIds} />
                            : chart.kind === 'table'
                                ? <ResultTable table={chart} players={result.players} playerIds={result.playerIds} />
                                : <LineChart chart={chart} players={result.players} playerIds={result.playerIds} />}
                    </Section>
                ))}

                {result?.canRegenerate && <RegenerateResults gameId={gameId} onRegenerated={replaceResult} />}
            </>)}
        </main>
    );
}

// Works this game's stats and charts out again from its moves, for a result
// recorded before a fix to how they are worked out — a quiet footer action,
// since a result that came out right never needs it.
function RegenerateResults({ gameId, onRegenerated }: { gameId: string, onRegenerated: (result: IGameResultResponse) => void }) {
    const { showToast } = useToast();
    const [isRegenerating, setIsRegenerating] = useState(false);

    const regenerate = async () => {
        setIsRegenerating(true);
        try {
            const response = await fetch(`/api/gameresult/${gameId}/regenerate`, { method: "POST" });
            if (!response.ok) {
                showToast(response.statusText || "Couldn't regenerate the results.", 'danger');
                return;
            }
            const data = await response.json();
            if (data?.success) onRegenerated(data.result);
            showToast("Results regenerated from the game's moves.", 'success');
        } catch (error) {
            console.error(error);
            showToast("Couldn't regenerate the results. Please try again.", 'danger');
        } finally {
            setIsRegenerating(false);
        }
    };

    return (
        <div className="ag-footer">
            <button type="button" className="ag-link-muted" disabled={isRegenerating} onClick={regenerate}>
                {isRegenerating ? "Regenerating results…" : "Regenerate results"}
            </button>
        </div>
    );
}
