import { describe, expect, it } from "vitest";
import { ABILITIES, CHARACTERS, FACTIONS, POINTS_BUDGET, squadPoints, type CharacterId, type PlayerCount } from "./characters";

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

describe("the factions (§29.3)", () => {
    it("muster every character, each for one faction alone", () => {
        const rosters = Object.values(FACTIONS).flatMap(faction => faction.characters);
        expect([...rosters].sort()).toEqual((Object.keys(CHARACTERS) as CharacterId[]).sort());
    });

    describe.each(Object.values(FACTIONS))("$name's ready-made squads (§17.2)", faction => {
        it.each([2, 3, 4] as PlayerCount[])("spend the whole %i-player budget, from its own roster", players => {
            expect(squadPoints(faction.readyMade[players])).toBe(POINTS_BUDGET[players]);
            expect(faction.readyMade[players].filter(character => !faction.characters.includes(character))).toEqual([]);
        });
    });
});
