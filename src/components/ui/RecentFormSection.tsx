'use client'

import Skeleton from "@/components/ui/Skeleton";
import { GAME_META } from "@/utils/ui/games";
import type { IRecentMatch, MatchOutcome } from "@/app/api/stats/route";
import moment from 'moment';

const OUTCOME_LABEL: Record<MatchOutcome, string> = { win: "W", loss: "L", draw: "D" };

interface RecentFormSectionProps {
    matches: IRecentMatch[];
    isLoading: boolean;
}

// "Recent form" - chips of a player's most recent match outcomes. Shared by
// a player's own profile and a friend's read-only profile.
export default function RecentFormSection({ matches, isLoading }: RecentFormSectionProps) {
    return (
        <div className="ag-section">
            <div className="ag-section-head">
                <h2 className="ag-section-label">Recent form</h2>
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
                    <div className="ag-chips">
                        {matches.map(match => (
                            <div
                                key={match.gameId}
                                className={`ag-result-dot ag-result-dot--${match.outcome}`}
                                title={`${GAME_META[match.url]?.name ?? match.url} · ${moment(match.endedAt).fromNow()}`}
                            >
                                {OUTCOME_LABEL[match.outcome]}
                            </div>
                        ))}
                    </div>
                )}
        </div>
    );
}
