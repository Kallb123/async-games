// Realm Arena's characters, their kits and their mastery as the screens word
// them (docs/games/realm-arena.md §13.6, §23): each one's mark, a weapon in a
// line, the options and where XP stands against the ranks. Readings of the
// data in characters.ts and mastery.ts, and nothing of the rules, so a screen
// outside the game — the profile's mastery section — can import them without
// carrying the whole of rules.ts into its bundle. The board's own readings of
// the battle are ui.ts's.

import { ABILITIES, CHARACTERS, EFFECTS, OPTIONS, type CharacterId, type OptionId, type Weapon } from "./characters";
import { nextRankXp, rankOf } from "./mastery";

/**
 * The placeholder figure each character stands as until PR 9's marked figures
 * (docs/games/realm-arena.md §17.3): one glyph, drawn on a disc in its owner's
 * colour, so two of the six never read alike at a glance.
 */
export const CHARACTER_MARK: Readonly<Record<CharacterId, string>> = {
    manAtArms: "🗡️",
    knight: "🛡️",
    archer: "🏹",
    scout: "👟",
    mage: "🔥",
    cleric: "✚",
};

/** The six characters in the order the muster lists them: §13.6's table's. */
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/** A weapon in one line: "80% · range 20 · 3 damage", and what it leaves on a hit: "· slowed on a hit". */
export function weaponLine(weapon: Weapon): string {
    if (weapon.kind === "melee") return `Melee · ${weapon.damage} damage`;
    const leaves = weapon.effect ? ` · ${EFFECTS[weapon.effect].name.toLowerCase()} on a hit` : "";
    return `${weapon.accuracy}% · range ${weapon.range} · ${weapon.damage} damage${leaves}`;
}

/** A character's options (§23.2), lowest rank first: what its muster row offers, locked or not. */
export function optionsFor(character: CharacterId): OptionId[] {
    return (Object.keys(OPTIONS) as OptionId[])
        .filter(id => OPTIONS[id].character === character)
        .sort((a, b) => OPTIONS[a].rank - OPTIONS[b].rank);
}

/** The glyph an ability's row leads with, where a weapon's leads with its character's mark. */
export const ABILITY_MARK = "✦";

/**
 * An option as a row shows it: its glyph, its name — the ability or weapon it
 * swaps in — and what it swaps out and does in its place ("In place of Cleave
 * · 2 AP · Strike one enemy…").
 */
export function optionView(id: OptionId): { icon: string; name: string; line: string } {
    const option = OPTIONS[id];
    if ("weapon" in option) {
        const { character, weapon } = option;
        return { icon: CHARACTER_MARK[character], name: weapon.name, line: `In place of the ${CHARACTERS[character].weapon.name} · ${weaponLine(weapon)}` };
    }
    const ability = ABILITIES[option.ability];
    return { icon: ABILITY_MARK, name: ability.name, line: `In place of ${ABILITIES[option.replaces].name} · ${ability.ap} AP · ${ability.description}` };
}

/** Where a character's XP stands against the ranks (§23.1): "75 XP · 105 more for rank 2". */
export function masteryLine(xp: number): string {
    const next = nextRankXp(xp);
    return next === undefined ? `${xp} XP · the highest rank` : `${xp} XP · ${next - xp} more for rank ${rankOf(xp) + 1}`;
}
