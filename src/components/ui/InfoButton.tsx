interface InfoButtonProps {
    /** What it tells a screen reader it opens: "About the Knight". */
    label: string;
    onClick: () => void;
}

/**
 * The small round "i" beside a name that opens what there is to know about it —
 * Realm Arena's muster puts one on each character and item it sells. Drawn
 * inline, so it sits after a row's title rather than costing the row a column.
 */
export default function InfoButton({ label, onClick }: InfoButtonProps) {
    return (
        <button type="button" className="ag-info-btn" aria-label={label} onClick={onClick}>i</button>
    );
}
