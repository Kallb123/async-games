'use client'

import { useState } from "react";
import Link from "next/link";
import Skeleton from "@/components/ui/Skeleton";
import Refreshable from "@/components/ui/Refreshable";
import MatchResultPopup from "@/components/ui/MatchResultPopup";
import GameThumb from "@/components/ui/GameThumb";
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

    return (
        <div className="ag-section">
            <div className="ag-section-head">
                <h2 className="ag-section-label">Recent form</h2>
                {viewAllHref && <Link href={viewAllHref} className="ag-section-action">See all</Link>}
            </div>
            {isLoading
                ? (
                    <div className="ag-chips">
                        {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} width={26} height={26} radius="50%" />)}
                    </div>
                )
                : matches.length === 0
                ? <div className="ag-empty">No finished games yet.</div>
                : (
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
                                    {meta && (
                                        <span className="ag-result-chip-icon">
                                            <GameThumb meta={meta} size={14} radius={4} />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </Refreshable>
                )}

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
        </div>
    );
}
