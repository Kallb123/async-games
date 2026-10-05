import { KeyboardEvent, ReactNode, Ref } from "react";

interface OptionRadioRowProps {
    title: ReactNode;
    description?: ReactNode;
    /** A caveat read second, under the description (a theme's "art not drawn yet"). */
    note?: ReactNode;
    /** Leads the row — an emoji or a small mark, for a choice with no art of its own. */
    glyph?: ReactNode;
    checked: boolean;
    onSelect: () => void;
    disabled?: boolean;
    /** Roving focus: the group makes only one radio its Tab stop. */
    tabIndex?: number;
    onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
    ref?: Ref<HTMLButtonElement>;
}

/**
 * One choice in a pick-exactly-one group: the whole row is the control, with a
 * radio mark where `OptionToggleRow` has its switch. It is a `role="radio"`, so
 * it only makes sense inside a `role="radiogroup"` — `OptionChoiceSection` is
 * that group, and is what a setup screen should reach for rather than this.
 */
export default function OptionRadioRow({
    title,
    description,
    note,
    glyph,
    checked,
    onSelect,
    disabled,
    tabIndex,
    onKeyDown,
    ref,
}: OptionRadioRowProps) {
    return (
        <button
            ref={ref}
            type="button"
            role="radio"
            aria-checked={checked}
            className={`ag-option-row ag-option-row--choice${checked ? " ag-option-row--on" : ""}`}
            onClick={onSelect}
            onKeyDown={onKeyDown}
            tabIndex={tabIndex}
            disabled={disabled}
        >
            {glyph != null && <span className="ag-option-glyph" aria-hidden="true">{glyph}</span>}
            <span className="ag-option-main">
                <span className="ag-option-title">{title}</span>
                {description && <span className="ag-option-desc">{description}</span>}
                {note && <span className="ag-option-note">{note}</span>}
            </span>
            <span className="ag-option-radio" aria-hidden="true" />
        </button>
    );
}
