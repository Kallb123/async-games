'use client'

import { use } from "react";
import GameThumb, { ROW_THUMB_RADIUS, ROW_THUMB_SIZE } from "@/components/ui/GameThumb";
import BackLink from "@/components/ui/BackLink";
import ListRow from "@/components/ui/ListRow";
import ListSection from "@/components/ui/ListSection";
import Section from "@/components/ui/Section";
import { gameResultStatRows } from "@/components/ui/GameResultStats";
import LineChart from "@/components/ui/LineChart";
import { useGameResult } from "@/utils/hooks/useGameResult";
import { GAME_META } from "@/utils/ui/games";
import { finishedGameCopy } from "@/utils/ui/players";
import { pluralize } from "@/utils/ui/text";
import moment from 'moment';

export default function GameResultPage({ params }: { params: Promise<{ gameId: string }> }) {
    const { gameId } = use(params);
    const { result, isLoading, error } = useGameResult(gameId);
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
                                {finishedGameCopy(result) ?? "Draw"} · {moment(result.endedAt).fromNow()} · {pluralize(result.totalTurns, 'turn')}
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
                        <LineChart chart={chart} players={result.players} />
                    </Section>
                ))}
            </>)}
        </main>
    );
}
