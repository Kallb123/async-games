import RecapTimeline from "@/components/ui/RecapTimeline";
import ReactionRow from "@/components/ui/ReactionRow";
import { playerColourForId } from "@/utils/ui/playerColours";
import { IHistoryEntryResponse } from "@/utils/apiModels/GameDataApi";

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

    return (
        <div className="ag-log ag-panel-open-pulse">
            <div className="ag-panel-head">
                <div>
                    <div className="ag-hand-title">Match history</div>
                    <div className="ag-panel-subtitle">{oldestFirst ? "Latest at the bottom" : "Latest at the top"}</div>
                </div>
                <button type="button" className="ag-panel-close" onClick={onClose} aria-label="Close turn history">✕</button>
            </div>
            {lines.length === 0 ? (
                <div className="ag-log-empty">No moves yet.</div>
            ) : (
                <RecapTimeline
                    compact
                    events={lines.map((entry, i) => ({
                        id: String(i),
                        dotColour: playerColourForId(entry.actorId, userIdList),
                        title: entry.text,
                        trailing: (
                            <ReactionRow
                                reactions={entry.reactions}
                                viewerId={viewerId}
                                onReact={onReact && entry.commandId ? (reaction) => onReact(entry.commandId!, reaction) : undefined}
                            />
                        ),
                    }))}
                />
            )}
        </div>
    );
}
