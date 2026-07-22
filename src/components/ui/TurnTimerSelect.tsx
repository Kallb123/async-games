'use client'

import { UNLIMITED_TURN_TIMER, isUnlimitedTurnTimer } from "@/utils/games/TurnTimer";

const OPTIONS: { value: string; label: string }[] = [
    { value: "10m", label: "10 min" },
    { value: "30m", label: "30 min" },
    { value: "1h", label: "1 hour" },
    { value: "3h", label: "3 hours" },
    { value: "6h", label: "6 hours" },
    { value: "12h", label: "12 hours" },
    { value: "1d", label: "1 day" },
    { value: "3d", label: "3 days" },
    { value: "7d", label: "7 days" },
    { value: UNLIMITED_TURN_TIMER, label: "Unlimited" },
];

interface TurnTimerSelectProps {
    value: string;
    onChange: (value: string) => void;
}

export default function TurnTimerSelect({ value, onChange }: TurnTimerSelectProps) {
    return (
        <div className="ag-section" style={{ padding: "20px 20px 0" }}>
            <div className="ag-section-head">
                <h2 className="ag-section-label">Turn timer</h2>
            </div>
            <select
                className="ag-select"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
            <p className="ag-hint">
                {isUnlimitedTurnTimer(value)
                    ? "Turns never expire — players can take as long as they like."
                    : "If time runs out the turn is skipped. We'll nudge everyone before that happens."}
            </p>
        </div>
    );
}
