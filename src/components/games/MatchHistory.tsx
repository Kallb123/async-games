import RecapTimeline from "@/components/ui/RecapTimeline";
import { playerColourFor } from "@/utils/ui/playerColours";

interface MatchHistoryProps {
    /** The game's log lines, newest first as the game state stores them. */
    entries: string[];
    /** The game's usernames in seat order — a line that names one is dotted in that player's colour. */
    usernames?: string[];
    /** Read the log the other way up, oldest line first. */
    oldestFirst?: boolean;
}

// The in-game match history every game shows behind the log toggle: the turn
// recap's timeline at its compact scale, each line dotted in the colour of
// whoever it is about. Lines nobody made (setup, the narrator) stay neutral.
export default function MatchHistory({ entries, usernames = [], oldestFirst = false }: MatchHistoryProps) {
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
                        dotColour: playerColourFor(usernames.find((username) => entry.startsWith(username)), usernames),
                        title: entry,
                    }))}
                />
            )}
        </div>
    );
}
