import RecapTimeline from "@/components/ui/RecapTimeline";
import { playerColourForId } from "@/utils/ui/playerColours";
import { IHistoryEntry } from "@/utils/games/history";

/** What a game hands `GameShell`'s `log` prop. */
export interface MatchHistoryProps {
    /** The game's log lines, newest first as the game state stores them. */
    entries: IHistoryEntry[];
    /** The game's players in seat order — a line is dotted in its actor's colour. */
    userIdList?: string[];
    /** Read the log the other way up, oldest line first. */
    oldestFirst?: boolean;
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
export default function MatchHistory({ entries, userIdList = [], oldestFirst = false }: MatchHistoryProps) {
    const lines = oldestFirst ? entries.slice().reverse() : entries;

    return (
        <div className="ag-log">
            <div className="ag-hand-title">Match history</div>
            {lines.length === 0 ? (
                <div className="ag-log-empty">No moves yet.</div>
            ) : (
                <RecapTimeline
                    compact
                    events={lines.map((entry, i) => ({
                        id: String(i),
                        dotColour: playerColourForId(entry.actorId, userIdList),
                        title: entry.text,
                    }))}
                />
            )}
        </div>
    );
}
