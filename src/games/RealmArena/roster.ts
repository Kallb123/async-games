// Realm Arena's characters, their kits and their mastery as the screens word
// them (docs/games/realm-arena.md §13.6, §23): each one's mark, a weapon in a
// line, the options and where XP stands against the ranks. Readings of the
// data in characters.ts and mastery.ts, and nothing of the rules, so a screen
// outside the game — the profile's mastery section — can import them without
// carrying the whole of rules.ts into its bundle. The board's own readings of
// the battle are ui.ts's.

import { CHARACTERS, type AbilityId, type CharacterId, type FactionId, type OptionId, type Weapon } from "./characters";
import { ruleValuesOf, rulesetOf, type RulesContext } from "./rulesets";
import { nextRankXp, rankOf, type PlayerMastery } from "./mastery";

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
    skitterling: "🦗",
    ravager: "🦂",
    spitter: "🧪",
    bloater: "🫧",
    broodmother: "👑",
    miner: "⛏️",
    stonewarden: "⚒️",
    prospector: "💎",
    sapper: "🧨",
    runepriest: "🔨",
};

/** Every character, in §13.6's table's order. */
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/** Whom a faction fields, in one line: "Man-at-Arms, Knight, Archer, …" — what the setup screen and the muster show beside its name (B6). */
export function factionRosterLine(id: FactionId, context?: RulesContext): string {
    const { FACTIONS, CHARACTERS } = rulesetOf(context);
    return FACTIONS[id].characters.map(character => CHARACTERS[character].name).join(", ");
}

/** A weapon in one line: "80% · range 20 · 3 damage", and what it leaves on a hit: "· slowed on a hit". */
export function weaponLine(weapon: Weapon, context?: RulesContext): string {
    if (weapon.kind === "melee") return `Melee · ${ruleValuesOf(context).MELEE_ACCURACY}% · ${weapon.damage} damage`;
    const { EFFECTS } = rulesetOf(context);
    const leaves = weapon.effect ? ` · ${EFFECTS[weapon.effect]!.name.toLowerCase()} on a hit` : "";
    return `${weapon.accuracy}% · range ${weapon.range} · ${weapon.damage} damage${leaves}`;
}

/** A character's options (§23.2), lowest rank first: what its muster row offers, locked or not. */
export function optionsFor(character: CharacterId, context?: RulesContext): OptionId[] {
    const { OPTIONS } = rulesetOf(context);
    return (Object.keys(OPTIONS) as OptionId[])
        .filter(id => OPTIONS[id].character === character)
        .sort((a, b) => OPTIONS[a].rank - OPTIONS[b].rank);
}

/** The glyph an ability's row leads with, where a weapon's leads with `weaponMark`. */
export const ABILITY_MARK = "✦";

/** The marks of the weapons an option swaps in, where the character's own mark would read wrong: Frost bolt isn't fire. */
const OPTION_WEAPON_MARK: Partial<Record<OptionId, string>> = { frostBolt: "❄️" };

/** The glyph a weapon's row leads with: its character's mark, or the swapped-in weapon's own. */
export function weaponMark(character: CharacterId, option?: OptionId): string {
    return (option && OPTION_WEAPON_MARK[option]) ?? CHARACTER_MARK[character];
}

/** A part of a character's kit an option can swap out (§23.2): its weapon, or one of its abilities. */
export type KitPart = AbilityId | "weapon";

/** A kit part or an option as a row shows it: its glyph, its name, and what it does. */
export interface KitView {
    icon: string;
    name: string;
    line: string;
}

/** A character's own kit part, as the starter character fights with it: "Cleave · 2 AP · Strike two enemies…". */
export function starterView(character: CharacterId, part: KitPart, context?: RulesContext): KitView {
    const { CHARACTERS, ABILITIES } = rulesetOf(context);
    if (part === "weapon") {
        const { weapon } = CHARACTERS[character];
        return { icon: weaponMark(character), name: weapon.name, line: weaponLine(weapon, context) };
    }
    const ability = ABILITIES[part]!;
    return { icon: ABILITY_MARK, name: ability.name, line: `${ability.ap} AP · ${ability.description}` };
}

/**
 * An option as a row shows it: its glyph, its name — the ability or weapon it
 * swaps in — and what it swaps out and does in its place ("In place of Cleave
 * · 2 AP · Strike one enemy…").
 */
export function optionView(id: OptionId, context?: RulesContext): KitView {
    const { OPTIONS, ABILITIES } = rulesetOf(context);
    const option = OPTIONS[id];
    const replaced = starterView(option.character, option.replaces, context).name;
    if ("weapon" in option) {
        const { character, weapon } = option;
        return { icon: weaponMark(character, id), name: weapon.name, line: `In place of the ${replaced} · ${weaponLine(weapon, context)}` };
    }
    const ability = ABILITIES[option.ability]!;
    return { icon: ABILITY_MARK, name: ability.name, line: `In place of ${replaced} · ${ability.ap} AP · ${ability.description}` };
}

/** Where a character's XP stands against the ranks (§23.1): "75 XP · 105 more for rank 2". */
export function masteryLine(xp: number): string {
    const next = nextRankXp(xp);
    return next === undefined ? `${xp} XP · the highest rank` : `${xp} XP · ${next - xp} more for rank ${rankOf(xp) + 1}`;
}

/** Active roster plus earned records for retired characters; retired unlocks aren't offered. */
export function masteryRoster(mastery: PlayerMastery, context?: RulesContext): { id: CharacterId; retired: boolean }[] {
    const { CHARACTERS, FACTIONS } = rulesetOf(context);
    const active = new Set(Object.values(FACTIONS).flatMap(faction => faction?.characters ?? []));
    return (Object.keys(CHARACTERS) as CharacterId[])
        .filter(id => active.has(id) || (mastery[id]?.xp ?? 0) > 0)
        .map(id => ({ id, retired: !active.has(id) }));
}
