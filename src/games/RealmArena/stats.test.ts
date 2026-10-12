import { describe, expect, it } from "vitest";
import { ABILITIES, CHARACTERS, ITEM_IDS, ITEMS, OPTIONS, THROW_RANGE } from "./characters";
import { CHARACTER_IDS } from "./roster";
import { ATTACK_AP, MELEE_ACCURACY, sightOf } from "./rules";
import { ALL_UNITS, characterStats, itemStats } from "./stats";

// The numbers are read from characters.ts, so a retune there doesn't fail
// these; only the wording and which column a number lands in are pinned.

const row = (character: Parameters<typeof characterStats>[0], name: string) => {
    const { actions, options } = characterStats(character);
    return [...actions, ...options].find(one => one.name === name);
};

describe("characterStats", () => {
    it("reads a character's headline numbers from its data and the rules' defaults", () => {
        const { hp, movement, points } = CHARACTERS.knight;
        expect(characterStats("knight").tiles).toEqual([
            { label: "HP", value: `${hp}` },
            { label: "Move/AP", value: `${movement}` },
            { label: "Sight", value: `${sightOf({ character: "knight" })}` },
            { label: "Points", value: `${points}` },
        ]);
        // Only a character that climbs better than most says so.
        expect(characterStats("scout").tiles).toContainEqual({ label: "Climb", value: "Full height" });
        expect(characterStats("mage").tiles.map(tile => tile.label)).not.toContain("Climb");
    });

    it("lists the weapon, then each ability, then each option", () => {
        const { actions, options } = characterStats("cleric");
        expect(actions.map(one => one.name)).toEqual(["Staff", "Heal", "Raise"]);
        expect(options.map(one => [one.name, one.kind])).toEqual([["Purify", `Rank ${OPTIONS.purify.rank} · in place of Raise`]]);
        for (const id of CHARACTER_IDS) expect(characterStats(id).actions).toHaveLength(1 + CHARACTERS[id].abilities.length);
    });

    it("gives a ranged weapon its range and odds, and a melee one the square next door at the melee 80%", () => {
        const bow = CHARACTERS.archer.weapon;
        if (bow.kind !== "ranged") throw new Error("The Archer shoots");
        expect(row("archer", "Bow")).toMatchObject({ ap: `${ATTACK_AP}`, damage: `${bow.damage}`, range: `${bow.range}`, hit: `${bow.accuracy}%`, cooldown: "—" });
        expect(row("manAtArms", "Sword")).toMatchObject({ damage: `${CHARACTERS.manAtArms.weapon.damage}`, range: "Next to", hit: `${MELEE_ACCURACY}%` });
        expect(row("ravager", "Rend")).toMatchObject({ damage: `${ABILITIES.rend.damage}`, range: "Next to", hit: `${MELEE_ACCURACY}%` });
        expect(row("manAtArms", "Shield bash")).toMatchObject({ range: "Next to", hit: `${MELEE_ACCURACY}%` });
    });

    it("takes an ability that uses the weapon at the weapon's odds and damage", () => {
        const bow = CHARACTERS.archer.weapon;
        if (bow.kind !== "ranged") throw new Error("The Archer shoots");
        expect(row("archer", "Aimed shot")).toMatchObject({
            ap: `${ABILITIES.aimedShot.ap}`, damage: `${bow.damage}`, range: `${bow.range}`,
            hit: `${Math.min(100, bow.accuracy + ABILITIES.aimedShot.hitBonus)}%`, cooldown: `${ABILITIES.aimedShot.cooldown}`,
        });
        expect(row("archer", "Crippling shot")).toMatchObject({ hit: `${bow.accuracy}%`, extras: ["On a hit: Slowed: half movement, 2 turns"] });
        expect(row("manAtArms", "Cleave")).toMatchObject({ damage: `${CHARACTERS.manAtArms.weapon.damage}`, range: "Next to", hit: `${MELEE_ACCURACY}%`, extras: ["Two enemies next to it"] });
    });

    it("gives an aimed ability its own range, damage and area, never rolled", () => {
        const { fireball } = ABILITIES;
        expect(row("mage", "Fireball")).toMatchObject({
            damage: `${fireball.damage}`, range: `${fireball.range}`, hit: "Always", cooldown: `${fireball.cooldown}`,
            extras: ["3×3, friend or foe", "Burning: 1 damage a turn, 2 turns", "Blasts away low cover"],
        });
        // Raise is on a cooldown now, not once a battle; Heal has none but is once a turn; a Burst is still once.
        expect(row("cleric", "Raise")).toMatchObject({ hit: "—", cooldown: `${ABILITIES.raise.cooldown}` });
        expect(row("cleric", "Heal")).toMatchObject({ range: `${ABILITIES.heal.range}`, hit: "—", cooldown: "1/turn", extras: [`Heals ${ABILITIES.heal.hp} HP`] });
        expect(row("bloater", "Burst")).toMatchObject({ cooldown: "Once" });
        expect(row("scout", "Sneak")).toMatchObject({ ap: `${ABILITIES.sneak.ap}`, damage: "—", cooldown: "—", extras: [`${ABILITIES.sneak.ap} AP for each AP a move would cost`] });
        expect(row("mage", "Frost bolt")).toMatchObject({ damage: `${OPTIONS.frostBolt.weapon.damage}`, hit: `${OPTIONS.frostBolt.weapon.accuracy}%`, extras: ["On a hit: Slowed: half movement, 2 turns"] });
    });
});

describe("itemStats", () => {
    it("shows what each item costs and does, used once and never rolled", () => {
        expect(itemStats("fireFlask").tiles).toContainEqual({ label: "Points", value: `${ITEMS.fireFlask.points}` });
        expect(itemStats("fireFlask").actions[0]).toMatchObject({ damage: `${ITEMS.fireFlask.damage}`, range: `${THROW_RANGE}`, hit: "Always", cooldown: "Once" });
        expect(itemStats("thunderFlask").actions[0].extras).toEqual(["3×3, friend or foe", "Stunned: 2 AP next turn, 1 turn"]);
        // A smoke pot hurts nobody, friend or foe.
        expect(itemStats("smokePot").actions[0]).toMatchObject({ hit: "—", extras: ["3×3", expect.stringContaining("no overwatch into it")] });
        expect(itemStats("healingDraught").actions[0]).toMatchObject({ range: "Next to", hit: "—", extras: ["The carrier or an ally next to them", `Heals ${ITEMS.healingDraught.hp} HP`] });
    });
});

describe("ALL_UNITS", () => {
    it("is every character and every item, in the muster's order", () => {
        expect(ALL_UNITS.map(unit => unit.id)).toEqual([...CHARACTER_IDS, ...ITEM_IDS]);
    });
});
