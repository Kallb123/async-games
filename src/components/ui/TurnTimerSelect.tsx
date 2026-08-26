'use client'

import Section from "@/components/ui/Section";
import { TURN_TIMER_OPTIONS, isUnlimitedTurnTimer } from "@/utils/games/TurnTimer";

interface TurnTimerSelectProps {
    value: string;
    onChange: (value: string) => void;
}

export default function TurnTimerSelect({ value, onChange }: TurnTimerSelectProps) {
    return (
        <Section label="Turn timer">
            <select
                className="ag-select"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {TURN_TIMER_OPTIONS.map(opt => (
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
        </Section>
    );
}
