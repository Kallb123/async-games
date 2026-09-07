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
// A line's reaction (if any) renders as a read-only pill — ReactionPicker with
// no onReact — because reacting only happens from the recap screen, on the
// window of actions a player was actually shown; this panel just shows what
// landed, on any line, to anyone still able to see it.
export default function MatchHistory({ entries, userIdList = [], oldestFirst = false, onClose }: MatchHistoryComponentProps) {
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
                    events={lines.map((entry, i) => ({
                        id: String(i),
                        dotColour: playerColourForId(entry.actorId, userIdList),
                        title: entry.text,
                        trailing: entry.reaction ? <ReactionPicker reacted={entry.reaction} /> : undefined,
                    }))}
                />
            )}
        </div>
    );
}
