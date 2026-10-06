'use client'

import { KeyboardEvent, ReactNode, useRef } from "react";
import OptionSection from "@/components/ui/OptionSection";
import OptionRadioRow from "@/components/ui/OptionRadioRow";

export interface OptionChoice<T extends string> {
    id: T;
    /** The row's heading — `label` so a game's own option tables (DIFFICULTY_TIERS, GAME_THEMES) can be passed straight in. */
    label: string;
    description?: ReactNode;
    /** A caveat shown under the description. */
    note?: ReactNode;
    /** Leads the row, for a choice with no art of its own (a theme's emoji). */
    glyph?: ReactNode;
}

interface OptionChoiceSectionProps<T extends string> {
    label: string;
    /** Notes shown under the card but still inside the section, e.g. hints. */
    footer?: ReactNode;
    /** Undefined while nothing is chosen yet (a theme before its default arrives). */
    value: T | undefined;
    choices: readonly OptionChoice<T>[];
    onChange: (id: T) => void;
    disabled?: boolean;
}

// Arrow keys step through a radio group the way they do a native one: down
// and right go forward, up and left go back, and both wrap round.
const STEP: Partial<Record<string, number>> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/**
 * A pick-exactly-one block on a setup screen: the labelled `OptionSection`
 * card holding one `OptionRadioRow` per choice, wired up as a radio group —
 * the chosen row is the group's one Tab stop, the arrow keys move the choice,
 * and tapping the row that is already chosen leaves it chosen.
 *
 * Every setup screen that offers one of several things goes through this:
 * Realm Arena's mode, mission and battle size, Fires Out's ruleset, the
 * co-ops' difficulty, Race Cars' circuit, Solitaire's draw and a game's theme
 * (`ThemeSelect`). `OptionToggleRow` stays the right thing for a genuinely
 * on/off setting (an expansion, a house rule).
 */
export default function OptionChoiceSection<T extends string>({
    label,
    footer,
    value,
    choices,
    onChange,
    disabled,
}: OptionChoiceSectionProps<T>) {
    const rows = useRef<(HTMLButtonElement | null)[]>([]);
    // With nothing chosen yet the first row is the Tab stop.
    const tabStop = Math.max(choices.findIndex(choice => choice.id === value), 0);

    const handleKeyDown = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
        const step = STEP[e.key];
        if (step === undefined) return;
        e.preventDefault();
        const next = (index + step + choices.length) % choices.length;
        onChange(choices[next].id);
        rows.current[next]?.focus();
    };

    return (
        <OptionSection label={label} footer={footer}>
            <div role="radiogroup" aria-label={label}>
                {choices.map((choice, index) => (
                    <OptionRadioRow
                        key={choice.id}
                        ref={el => { rows.current[index] = el; }}
                        title={choice.label}
                        description={choice.description}
                        note={choice.note}
                        glyph={choice.glyph}
                        checked={value === choice.id}
                        onSelect={() => onChange(choice.id)}
                        onKeyDown={handleKeyDown(index)}
                        tabIndex={index === tabStop ? 0 : -1}
                        disabled={disabled}
                    />
                ))}
            </div>
        </OptionSection>
    );
}
