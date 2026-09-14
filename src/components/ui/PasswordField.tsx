'use client'

import { ReactNode } from "react";

interface PasswordFieldProps {
    /** Ties the label to the input — unique to the screen using it. */
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    /** Browsers use this to tell a new password from the one that unlocks it. */
    autoComplete: "new-password" | "current-password";
    placeholder?: string;
    minLength?: number;
    disabled?: boolean;
    hint?: ReactNode;
}

/**
 * A "type a password" field: label, `ag-input` password box, optional note
 * underneath. The access gate, the guest claim form and the account settings
 * password form each typed this markup out themselves — the same field asked
 * four times, so it is written once.
 */
export default function PasswordField({
    id, label, value, onChange, autoComplete, placeholder, minLength, disabled, hint,
}: PasswordFieldProps) {
    return (
        <div>
            <label htmlFor={id} className="ag-section-label ag-field-label">{label}</label>
            <input
                id={id}
                className="ag-input"
                type="password"
                autoComplete={autoComplete}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                minLength={minLength}
                disabled={disabled}
                required
            />
            {hint && <p className="ag-hint ag-hint--tight">{hint}</p>}
        </div>
    );
}
