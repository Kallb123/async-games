'use client'

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
            <div className="ag-timer-grid">
                {OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        type="button"
                        className={`ag-timer-opt ${value === opt.value ? "ag-timer-opt--active" : ""}`}
                        onClick={() => onChange(opt.value)}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            <p className="ag-hint">If time runs out the turn is skipped. We&apos;ll nudge everyone before that happens.</p>
        </div>
    );
}
