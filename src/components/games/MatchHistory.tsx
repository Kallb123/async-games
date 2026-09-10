'use client'
import { useLayoutEffect, useRef, useState } from 'react';
import PanelHead from "@/components/ui/PanelHead";
import RecapTimeline from "@/components/ui/RecapTimeline";
import ReactionRow from "@/components/ui/ReactionRow";
import { playerColourForId } from "@/utils/ui/playerColours";
import { IHistoryEntryResponse } from "@/utils/apiModels/GameDataApi";
import { formatRelativeTime } from "@/utils/ui/time";
import { useNowToTheMinute } from "@/utils/hooks/useNow";

/** What a game hands `GameShell`'s `log` prop. */
export interface MatchHistoryProps {
    /** The game's log lines, newest first as the game state stores them. */
    entries: IHistoryEntryResponse[];
    /** The game's players in seat order — a line is dotted in its actor's colour. */
    userIdList?: string[];
    /** Read the log the other way up, oldest line first. */
    oldestFirst?: boolean;
    /** The signed-in viewer's userId — tells their own reaction (shown as
     *  their sent pill, or the picker to add one) apart from every other
     *  player's (always read-only). Required alongside `onReact` to react from
     *  the log; omit both for a fully read-only log. */
    viewerId?: string;
    /** Adds the viewer's reaction to one line, keyed by its commandId. Omit
     *  (along with `viewerId`) for a read-only log — e.g. while reviewing a
     *  past or hypothetical turn that was never really played. */
    onReact?: (commandId: string, reaction: string) => void;
}

interface MatchHistoryComponentProps extends MatchHistoryProps {
    /** Closes the panel — the panel's own ✕, mirroring the top-bar 📜 toggle
     *  and the chat panel's close button. Supplied by `GameShell`, not by the
     *  game — the game only hands over what to show, not how it closes. */
    onClose: () => void;
}

// The in-game match history every game shows behind the log toggle: the turn
// recap's timeline at its compact scale, each line dotted in the colour of
// whoever it is about. Lines nobody made (setup, the narrator) stay neutral.
//
// Whose line it is comes from the actorId the game recorded when it wrote the
// line. This used to guess, by looking for a player whose name the line started
// with — which picked the wrong player when one name prefixed another ("Dave"
// and "DaveT", settled by seat order), and lost the colour entirely once a
// player renamed and the frozen line no longer matched anybody.
//
// A line's reactions (every player's — reactions are public) render via
// ReactionRow, which also gives the viewer's own slot the picker trigger
// when `onReact` is wired up, so they can add one right here instead of only
// from the recap screen. Without `onReact` (reviewing a past or hypothetical
// turn, which isn't a real stored line to react to) it falls back to a
// fully read-only row.
export default function MatchHistory({ entries, userIdList = [], oldestFirst = false, viewerId, onReact, onClose }: MatchHistoryComponentProps) {
    const lines = oldestFirst ? entries.slice().reverse() : entries;
    const timelineRef = useRef<HTMLOListElement | null>(null);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const now = useNowToTheMinute();

    // Scroll to the latest entry when it changes: bottom when latest is at the
    // bottom, top when latest is at the top.
    useLayoutEffect(() => {
        if (timelineRef.current) {
            const targetScrollTop = oldestFirst ? timelineRef.current.scrollHeight : 0;
            timelineRef.current.scrollTop = targetScrollTop;
        }
    }, [entries, oldestFirst]);

    return (
        <div className="ag-log ag-panel-open-pulse">
            <PanelHead
                title="Match history"
                subtitle={oldestFirst ? "Latest at the bottom" : "Latest at the top"}
                onClose={onClose}
                closeLabel="Close turn history"
            />
            {lines.length === 0 ? (
                <div className="ag-log-empty">No moves yet.</div>
            ) : (
                <RecapTimeline
                    ref={timelineRef}
                    compact
                    events={lines.map((entry, i) => {
                        const isExpanded = expandedIndex === i;
                        const relativeTime = entry.createdAt ? formatRelativeTime(entry.createdAt, now) : null;
                        return {
                            id: String(i),
                            dotColour: playerColourForId(entry.actorId, userIdList),
                            title: entry.text,
                            onClick: () => setExpandedIndex(isExpanded ? null : i),
                            trailing: (
                                <div className="ag-history-entry-trail">
                                    <ReactionRow
                                        reactions={entry.reactions}
                                        viewerId={viewerId}
                                        onReact={onReact && entry.commandId ? (reaction) => onReact(entry.commandId!, reaction) : undefined}
                                    />
                                    {relativeTime && (
                                        <div className={`ag-history-timestamp ${isExpanded ? 'ag-history-timestamp--expanded' : ''}`}>
                                            {relativeTime}
                                        </div>
                                    )}
                                </div>
                            ),
                        };
                    })}
                />
            )}
        </div>
    );
}
