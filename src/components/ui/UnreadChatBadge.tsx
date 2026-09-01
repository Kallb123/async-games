interface UnreadChatBadgeProps {
    count: number;
    // The card's own background is already a colour, not the app's usual light
    // surface (MyTurnList's turn card) — swap to the translucent-white pill
    // .ag-turn-card-badge already reads correctly against, instead of the
    // default solid one built for a light row (TheirTurnList).
    onDark?: boolean;
}

/**
 * How many chat messages a player hasn't read in one game — MyTurnList's turn
 * card and TheirTurnList's list row, the dashboard's two "what needs you next"
 * lists. One component so a third call site reuses it rather than growing a
 * second pill (docs/in-game-chat.md §13.6).
 *
 * Renders nothing at zero — an unread badge that can show "0" isn't one.
 * Caps the label at "9+" so a thread nobody has read for a month doesn't blow
 * out a small pill; the real count still goes to `aria-label` rather than
 * leaving a screen reader to read a bare "9+" next to a game name.
 */
export default function UnreadChatBadge({ count, onDark }: UnreadChatBadgeProps) {
    if (count <= 0) {
        return null;
    }

    return (
        <span
            className={onDark ? "ag-chat-badge ag-chat-badge--on-dark" : "ag-chat-badge"}
            aria-label={`${count} unread chat message${count === 1 ? "" : "s"}`}
        >
            💬 {count > 9 ? "9+" : count}
        </span>
    );
}
