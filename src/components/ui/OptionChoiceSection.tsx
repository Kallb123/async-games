import { ReactNode } from "react";
import OptionSection from "@/components/ui/OptionSection";
import OptionToggleRow from "@/components/ui/OptionToggleRow";

export interface OptionChoice<T extends string> {
    id: T;
    /** The row's heading — `label` so a game's own option tables (DIFFICULTY_TIERS, GAME_THEMES) can be passed straight in. */
    label: string;
    description?: ReactNode;
    /** Defaults to "Choose <label>". */
    ariaLabel?: string;
}

interface OptionChoiceSectionProps<T extends string> {
    label: string;
    /** Notes shown under the card but still inside the section, e.g. hints. */
    footer?: ReactNode;
    value: T;
    choices: readonly OptionChoice<T>[];
    onChange: (id: T) => void;
    disabled?: boolean;
}

/**
 * A pick-exactly-one block on a setup screen: the labelled `OptionSection`
 * card, one `OptionToggleRow` per choice, and the "re-assert, don't toggle"
 * behaviour a radio group needs — tapping the row that is already on leaves it
 * on rather than turning the setting off entirely.
 *
 * Every setup screen that needed this shape had been hand-rolling it, and
 * Outbreak's difficulty picker had already written the trigger down in a
 * comment: "worth an OptionRadioRow primitive if a second setup screen needs
 * this shape". Fires Out's ruleset picker was the second, its difficulty
 * picker the third and its solo/crew mode picker the fourth — all three in one
 * file — so this is that primitive. `OptionToggleRow` stays the right thing
 * for a genuinely on/off setting (an expansion, a house rule).
 */
export default function OptionChoiceSection<T extends string>({
    label,
    footer,
    value,
    choices,
    onChange,
    disabled,
}: OptionChoiceSectionProps<T>) {
    return (
        <OptionSection label={label} footer={footer}>
            {choices.map(choice => (
                <OptionToggleRow
                    key={choice.id}
                    title={choice.label}
                    description={choice.description}
                    on={value === choice.id}
                    onToggle={() => onChange(choice.id)}
                    disabled={disabled}
                    ariaLabel={choice.ariaLabel ?? `Choose ${choice.label}`}
                />
            ))}
        </OptionSection>
    );
}
