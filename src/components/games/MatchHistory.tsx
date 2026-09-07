import RecapTimeline from "@/components/ui/RecapTimeline";
import ReactionPicker from "@/components/ui/ReactionPicker";
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
// Every other player's reaction on a line (if any) renders as a read-only
// pill — ReactionPicker with no onReact. The viewer's own slot is the same
// pill once they've reacted, or — when `onReact` is wired up — the picker
// trigger so they can add one right here instead of only from the recap
// screen. Without `onReact` (reviewing a past or hypothetical turn, which
// isn't a real stored line to react to) the viewer's own reaction, if any,
// just joins the read-only row like anyone else's.
export default function MatchHistory({ entries, userIdList = [], oldestFirst = false, viewerId, onReact, onClose }: MatchHistoryComponentProps) {
    const lines = oldestFirst ? entries.slice().reverse() : entries;

    return (
        <div className="ag-log ag-panel-open-pulse">
            <div className="ag-panel-head">
                <div className="ag-hand-title">Match history</div>
                <button type="button" className="ag-panel-close" onClick={onClose} aria-label="Close turn history">✕</button>
            </div>
            {lines.length === 0 ? (
                <div className="ag-log-empty">No moves yet.</div>
            ) : (
                <RecapTimeline
                    compact
                    events={lines.map((entry, i) => {
                        const canReact = !!(onReact && viewerId && entry.commandId);
                        const mine = canReact ? entry.reactions?.find((r) => r.actorId === viewerId) : undefined;
                        const others = mine ? (entry.reactions ?? []).filter((r) => r !== mine) : (entry.reactions ?? []);

                        return {
                            id: String(i),
                            dotColour: playerColourForId(entry.actorId, userIdList),
                            title: entry.text,
                            trailing: (others.length || canReact) ? (
                                <div className="ag-chips ag-recap-reactions">
                                    {others.map((r) => (
                                        <ReactionPicker
                                            key={r.actorId}
                                            reacted={r.reaction}
                                            reactedLabel={`${r.actorUsername} reacted ${r.reaction}`}
                                        />
                                    ))}
                                    {canReact && (
                                        <ReactionPicker
                                            reacted={mine?.reaction ?? null}
                                            onReact={(reaction) => onReact!(entry.commandId!, reaction)}
                                        />
                                    )}
                                </div>
                            ) : undefined,
                        };
                    })}
                />
            )}
        </div>
    );
}
