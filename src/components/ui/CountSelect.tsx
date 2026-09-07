'use client'

import { ReactNode } from "react";
import Section from "@/components/ui/Section";

interface CountSelectProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    /** Inclusive bounds of the range offered. `min` defaults to 0. */
    min?: number;
    max: number;
    /** How one option reads, e.g. `n => pluralize(n, 'firefighter')`. */
    optionLabel: (count: number) => string;
    /** The `ag-hint` under the select. Usually depends on `value`. */
    hint?: ReactNode;
    disabled?: boolean;
}

/**
 * A labelled "how many?" `<select>` over an inclusive numeric range, with the
 * hint line under it — the shape every count picker on a setup screen shares
 * (`SeatCountSelect`'s open seats, Fires Out's solo crew size). The select is
 * the design system's `ag-select` and the block is a `Section`, so a screen
 * never hand-rolls one.
 */
export default function CountSelect({ label, value, onChange, min = 0, max, optionLabel, hint, disabled }: CountSelectProps) {
    // Callers clamp their own chosen value, so `value` is always in range;
    // this only guards a range with nothing in it (a full party leaving no
    // seat to open), which would otherwise render `Array.from({ length: -1 })`.
    const count = Math.max(max - min + 1, 1);

    return (
        <Section label={label}>
            <select
                className="ag-select"
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                disabled={disabled}
            >
                {Array.from({ length: count }, (_, i) => min + i).map(option => (
                    <option key={option} value={option}>{optionLabel(option)}</option>
                ))}
            </select>
            {hint != null && <p className="ag-hint">{hint}</p>}
        </Section>
    );
}
