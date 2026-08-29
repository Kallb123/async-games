'use client'

import DieFace from "@/components/ui/DieFace";

interface DisplayNameFieldProps {
    /** Ties the label to the input — unique to the screen using it. */
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    /** Each caller's own cap — a display name and a handle differ. */
    maxLength: number;
    placeholder?: string;
    disabled?: boolean;
    /**
     * The dice button beside the field. Both or neither: the caller owns the
     * face it shows, because /join draws the first one on the server so the
     * browser's first render agrees with the HTML it's hydrating.
     */
    dieValue?: number;
    onReroll?: () => void;
}

/**
 * A "what are you called?" text field: label, `ag-input`, and an optional
 * dice button that rerolls it to a random name. Shared by the guest join
 * form (the name a seat is taken under) and the profile handle editor —
 * the same field asked twice, so it is written once.
 *
 * Presentational only. Neither caller's name goes to the same place — /join
 * posts it to the join API, /profile writes it to Clerk — so validating and
 * submitting stay with the form, and only the field itself is shared.
 */
export default function DisplayNameField({
    id, label, value, onChange, maxLength, placeholder, disabled, dieValue, onReroll,
}: DisplayNameFieldProps) {
    return (
        <div>
            <label htmlFor={id} className="ag-section-label ag-field-label">{label}</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                    id={id}
                    className="ag-input"
                    type="text"
                    autoComplete="off"
                    maxLength={maxLength}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    style={{ flex: 1 }}
                />
                {onReroll && dieValue !== undefined && (
                    <button
                        type="button"
                        className="ag-die-btn"
                        onClick={onReroll}
                        disabled={disabled}
                        aria-label="Shuffle to a new random name"
                        title="Shuffle to a new random name"
                    >
                        <DieFace value={dieValue} size={32} />
                    </button>
                )}
            </div>
        </div>
    );
}
