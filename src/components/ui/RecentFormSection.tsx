'use client'

import { useState } from "react";
import Link from "next/link";
import { SkeletonChips } from "@/components/ui/Skeleton";
import CollapsingSection from "@/components/ui/CollapsingSection";
import Refreshable from "@/components/ui/Refreshable";
import MatchResultPopup from "@/components/ui/MatchResultPopup";
import ThumbBadge from "@/components/ui/ThumbBadge";
import useAnimatedList from "@/utils/hooks/useAnimatedList";
import { GAME_META } from "@/utils/ui/games";
import type { IRecentMatch, MatchOutcome } from "@/app/api/stats/route";
import moment from 'moment';

const OUTCOME_LABEL: Record<MatchOutcome, string> = { win: "W", loss: "L", draw: "D" };

interface RecentFormSectionProps {
    matches: IRecentMatch[];
    isLoading: boolean;
    isRefreshing?: boolean;
    // Ring-highlight matches the viewer also played in. Only meaningful on a
    // friend's profile - on your own profile every match already includes you.
    highlightShared?: boolean;
    // Link to the full completed-games history. Only meaningful on your own
    // profile - there's no equivalent full list for a friend's profile.
    viewAllHref?: string;
}

// "Recent form" - chips of a player's most recent match outcomes. Shared by
// a player's own profile and a friend's read-only profile. Tapping a chip
// opens a popup with that match's game-specific stats.
export default function RecentFormSection({ matches, isLoading, isRefreshing = false, highlightShared = false, viewAllHref }: RecentFormSectionProps) {
    const [selected, setSelected] = useState<IRecentMatch | null>(null);
    const isEmpty = !isLoading && matches.length === 0;

    // The chips are one block rather than a list of rows, so they go to
    // `useAnimatedList` as a single node: a chip is 26px wide on a line that
    // wraps, and collapsing its height would leave a hole in that line instead
    // of closing it up. The whole row animates as one — the placeholder chips
    // hand over to the real ones in place, and a profile with nothing to show
    // collapses them rather than blinking them away.
    const chips = useAnimatedList(
        matches.length > 0
            ? (
                <Refreshable className="ag-chips" isRefreshing={isRefreshing}>
                    {matches.map(match => {
                        const meta = GAME_META[match.url];
                        const shared = highlightShared && match.sharedWithViewer;
                        return (
                            <button
                                key={match.gameId}
                                type="button"
                                className={`ag-result-chip${shared ? " ag-result-chip--shared" : ""}`}
                                title={`${meta?.name ?? match.url} · ${moment(match.endedAt).fromNow()}${shared ? " · you played too" : ""}`}
                                onClick={() => setSelected(match)}
                            >
                                <span className={`ag-result-dot ag-result-dot--${match.outcome}`}>
                                    {OUTCOME_LABEL[match.outcome]}
                                </span>
                                {meta && <ThumbBadge meta={meta} size={14} radius={4} className="ag-result-chip-icon" />}
                            </button>
                        );
                    })}
                </Refreshable>
            )
            : null,
        { isLoading, placeholder: { node: <SkeletonChips />, count: 1 } },
    );
    // Grows in where the chips were, on the same animation, the way a
    // `ListSection`'s `empty` message does — so the two cross over rather than
    // swapping in one jump. The section itself never collapses: it always has
    // this to say instead.
    const emptyMessage = useAnimatedList(isEmpty ? <div className="ag-empty">No finished games yet.</div> : null);

    return (
        <CollapsingSection
            label="Recent form"
            isLoading={isLoading}
            action={viewAllHref ? <Link href={viewAllHref} className="ag-section-action">See all</Link> : undefined}
        >
            {chips}
            {emptyMessage}

            {highlightShared && matches.some(match => match.sharedWithViewer) && (
                <p className="ag-hint">
                    <span className="ag-result-chip-icon-legend ag-result-chip--shared" /> = a game you played together
                </p>
            )}

            {selected && (
                <MatchResultPopup
                    gameId={selected.gameId}
                    outcome={selected.outcome}
                    onClose={() => setSelected(null)}
                />
            )}
        </CollapsingSection>
    );
}
