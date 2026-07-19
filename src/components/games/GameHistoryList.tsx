interface GameHistoryListProps {
    history: string[];
    // Number of entries at the front of `history` that are hypothetical planned
    // moves (from planning mode) rather than real turns.
    plannedCount?: number;
}

// Newest-first history log shared by the game pages. Planned entries are shown
// in italics with a compass marker so they can't be mistaken for real turns.
export default function GameHistoryList({ history, plannedCount = 0 }: GameHistoryListProps) {
    return (
        <ul>
            {history.map((historyString, index) =>
                index < plannedCount ? (
                    <li key={index} style={{ fontStyle: "italic", opacity: 0.75 }} title="Planned move – not played yet">
                        🧭 {historyString}
                    </li>
                ) : (
                    <li key={index}>{historyString}</li>
                )
            )}
        </ul>
    );
}
