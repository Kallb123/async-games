'use client'

import OptionSection from "@/components/ui/OptionSection";
import { themesForGame } from "@/utils/ui/gameThemes";

interface ThemeSelectProps {
    /** The game's url slug, as `GAME_META` keys it. */
    gameUrl: string;
    /** The chosen theme's id. */
    value: string | undefined;
    onChange: (themeId: string) => void;
}

/**
 * The dressing a game is played in, picked at setup: same rules, same numbers,
 * different names and pictures (see `utils/ui/gameThemes.ts`).
 *
 * Game-agnostic on purpose — it asks the registry what the game offers rather
 * than being told, so a game becomes themed by adding a `themes.ts` and this
 * one line to its setup screen. A game with nothing to choose between renders
 * nothing at all, which is why it is safe to drop into any setup screen.
 */
export default function ThemeSelect({ gameUrl, value, onChange }: ThemeSelectProps) {
    const themes = themesForGame(gameUrl);
    if (themes.length < 2) return null;

    return (
        <OptionSection
            label="Theme"
            footer={
                <p className="ag-hint">
                    A theme changes what everything is called and how it looks. The rules, the costs
                    and the numbers are identical either way.
                </p>
            }
        >
            {themes.map(theme => {
                const on = theme.id === value;
                return (
                    <button
                        key={theme.id}
                        type="button"
                        className={`ag-option-row ag-option-row--choice${on ? " ag-option-row--on" : ""}`}
                        aria-pressed={on}
                        onClick={() => onChange(theme.id)}
                    >
                        <span className="ag-option-glyph" aria-hidden="true">{theme.glyph}</span>
                        <span className="ag-option-main">
                            <span className="ag-option-title">{theme.name}</span>
                            <span className="ag-option-desc">{theme.description}</span>
                            {theme.note && <span className="ag-option-note">{theme.note}</span>}
                        </span>
                        <span className="ag-option-radio" />
                    </button>
                );
            })}
        </OptionSection>
    );
}
