import type { RealmArenaRuleValues } from "./ruleValues";
import { catalogueV7 } from "./catalogues/v7";
import type { Ability, AbilityId, Character, CharacterId, CharacterOption, Effect, EffectId, Faction, FactionId, Item, ItemId, OptionId, Weapon } from "./characters";

/** Independent of commandVersion: a protocol change need not change a match's rules. */
export const CURRENT_RULESET_VERSION = 7;

// Keep each entry's required fields (e.g. Fireball's range) while allowing
// later catalogues to change their values without copying the whole table.
type Table<T, Shape> = { readonly [Id in keyof T]: Readonly<Shape & { [Key in Exclude<keyof T[Id], "oncePerTurn" | "oncePerBattle">]: Key extends keyof Shape ? NonNullable<Shape[Key]> : never }> };
export interface RealmArenaRuleset {
    readonly RULES: Readonly<RealmArenaRuleValues>;
    readonly CHARACTERS: Readonly<Partial<Record<CharacterId, Character>>> & Readonly<Record<keyof typeof catalogueV7.CHARACTERS, Character>>;
    readonly ABILITIES: Readonly<Partial<Record<AbilityId, Ability>>> & Table<typeof catalogueV7.ABILITIES, Ability>;
    readonly OPTIONS: Readonly<Partial<Record<OptionId, CharacterOption>>> & typeof catalogueV7.OPTIONS;
    readonly ITEMS: Readonly<Partial<Record<ItemId, Item>>> & Table<typeof catalogueV7.ITEMS, Item>;
    readonly EFFECTS: Readonly<Partial<Record<EffectId, Effect>>> & Table<typeof catalogueV7.EFFECTS, Effect>;
    readonly FACTIONS: Readonly<Partial<Record<FactionId, Faction>>> & Readonly<Record<keyof typeof catalogueV7.FACTIONS, Faction>>;
}

/** Runtime freezing also protects nested weapons, ability lists and ready-made squads. */
function freeze<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
    }
    return value;
}

const rulesetV7: RealmArenaRuleset = freeze(catalogueV7);

// Games created before the balance release had no stamp, or one below 7.
// These are complete definitions, including the old descriptions and limits.
const legacyRuleset: RealmArenaRuleset = freeze({
    ...catalogueV7,
    RULES: { ...catalogueV7.RULES, MELEE_ROLLS: false, MELEE_ACCURACY: 100, FAR_SHOT_DISTANCE: null,
        TEAM_HP_FACTOR: 1, ARMOUR: 0, HOLD_OUT_ENEMY_STEPS: 0, HOLD_OUT_PAIR_ROUNDS: 15 },
    CHARACTERS: {
        ...catalogueV7.CHARACTERS,
        mage: { ...catalogueV7.CHARACTERS.mage, weapon: { name: "Bolt", kind: "ranged", damage: 3, accuracy: 70, range: 10 } as Weapon },
    },
    ABILITIES: {
        ...catalogueV7.ABILITIES,
        heal: { name: "Heal", ap: 2, cooldown: 2, range: 12, hp: 4, description: "Restore 4 HP to itself or an ally it can see within 12 squares, and clear burning, slowed, stunned and corroded" },
        raise: { name: "Raise", ap: 3, cooldown: 0, apOnRaise: 0, oncePerBattle: true, description: "Bring a downed ally next to them back at half HP. Once a battle" },
    },
});

const RULESETS: Readonly<Record<number, RealmArenaRuleset>> = Object.freeze({
    0: legacyRuleset, 1: legacyRuleset, 2: legacyRuleset, 3: legacyRuleset,
    4: legacyRuleset, 5: legacyRuleset, 6: legacyRuleset, 7: rulesetV7,
});

export const currentRuleset = rulesetFor(CURRENT_RULESET_VERSION);

/** Missing means legacy forever. Unknown versions fail instead of silently using today's rules. */
export function rulesetFor(rulesVersion: number | undefined): RealmArenaRuleset {
    const version = rulesVersion ?? 0;
    if (!Number.isInteger(version) || !Object.hasOwn(RULESETS, version)) throw new Error(`Unsupported Realm Arena rules version: ${version}`);
    return RULESETS[version];
}

/**
 * A game, or anything built from one, carrying the version it was created
 * under. Only `rulesVersion` selects a catalogue: a missing one is legacy,
 * never guessed from a derived flag such as `BattleState.balanced`.
 */
export type RulesContext = { rulesVersion?: number };

/** For helpers that also serve setup/profile tools, no game means the current catalogue. */
export function rulesetOf(context?: RulesContext): RealmArenaRuleset {
    return context === undefined ? currentRuleset : rulesetFor(context.rulesVersion);
}

/** Read rule values for a game; omitted context is reserved for non-game tools. */
export const ruleValuesOf = (context?: RulesContext): Readonly<RealmArenaRuleValues> => rulesetOf(context).RULES;
