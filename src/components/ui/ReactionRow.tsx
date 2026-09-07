import ReactionPicker from "@/components/ui/ReactionPicker";
import { IReactionSummary, viewerReaction } from "@/utils/reactions";

interface ReactionRowProps {
    /** Every player's reaction on this line or event — reactions are public,
     *  so everyone in the game sees all of them, not just their own. */
    reactions?: IReactionSummary[];
    /** The signed-in viewer's userId, so their own reaction gets the
     *  interactive slot (sent pill or the picker trigger) instead of a plain
     *  read-only one. Required alongside `onReact` to react from here at all. */
    viewerId?: string;
    /** Adds the viewer's reaction. Omit (along with `viewerId`) for a
     *  read-only row — every reaction, including the viewer's own if any,
     *  then renders as a plain pill. */
    onReact?: (reaction: string) => void;
}

// One line's row of reaction pills — the recap timeline and the match-history
// log are the same picture: every other player's reaction as a read-only
// pill, and, when `onReact` is wired up, the viewer's own slot as either the
// picker trigger or their sent pill. Shared so both screens agree on how a
// line with several players' reactions lays out, rather than each rebuilding
// the same read-only/interactive split.
export default function ReactionRow({ reactions, viewerId, onReact }: ReactionRowProps) {
    const canReact = !!(onReact && viewerId);
    const others = canReact ? (reactions ?? []).filter((r) => r.actorId !== viewerId) : (reactions ?? []);
    const mine = canReact ? viewerReaction(reactions, viewerId!) : null;

    if (!others.length && !canReact) {
        return null;
    }

    return (
        <div className="ag-chips ag-recap-reactions">
            {others.map((r) => (
                <ReactionPicker
                    key={r.actorId}
                    reacted={r.reaction}
                    reactedLabel={`${r.actorUsername} reacted ${r.reaction}`}
                />
            ))}
            {canReact && <ReactionPicker reacted={mine} onReact={onReact} />}
        </div>
    );
}
