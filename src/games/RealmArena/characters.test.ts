import { describe, expect, it } from "vitest";
import { ABILITIES, CHARACTERS, POINTS_BUDGET, REALM, squadPoints, type PlayerCount } from "./characters";

describe("the first faction's characters (§13.6)", () => {
    it("each have 5–12 HP and abilities that exist", () => {
        for (const character of Object.values(CHARACTERS)) {
            expect(character.hp, character.name).toBeGreaterThanOrEqual(5);
            expect(character.hp, character.name).toBeLessThanOrEqual(12);
            for (const ability of character.abilities) expect(ABILITIES[ability], `${character.name}: ${ability}`).toBeDefined();
        }
    });

    it("let a Man-at-arms down a Mage in one turn, as §13.2's balance note says", () => {
        expect(2 * CHARACTERS.manAtArms.weapon.damage).toBeGreaterThanOrEqual(CHARACTERS.mage.hp);
    });
});

describe("the ready-made squads (§17.2)", () => {
    it.each([2, 3, 4] as PlayerCount[])("spend the whole %i-player budget", players => {
        expect(squadPoints(REALM.readyMade[players])).toBe(POINTS_BUDGET[players]);
    });
});
