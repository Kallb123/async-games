interface InfoButtonProps {
    /** What it tells a screen reader it opens: "About the Knight". */
    label: string;
    onClick: () => void;
    /** "info" draws the "i"; "help" a "?", for one that explains a number rather than a name. */
    variant?: 'info' | 'help';
}

/**
 * The small round "i" (or, as `help`, "?") beside a name that opens what there is to know about it —
 * Realm Arena's muster puts one on each character and item it sells. Drawn
 * inline, so it sits after a row's title rather than costing the row a column.
 */
export default function InfoButton({ label, onClick, variant = 'info' }: InfoButtonProps) {
    const help = variant === 'help';
    return (
        <button type="button" className={`ag-info-btn${help ? ' ag-info-btn--help' : ''}`} aria-label={label} onClick={onClick}>
            {help ? '?' : 'i'}
        </button>
    );
}
