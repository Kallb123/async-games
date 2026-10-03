import { describe, expect, it } from "vitest";
import { ABILITIES, kitOf } from "./characters";
import { masteryLine, optionsFor, optionView, starterView, weaponLine, weaponMark } from "./roster";

describe("optionsFor, starterView and optionView", () => {
    it("lists each character's own options, and nobody else's", () => {
        expect(optionsFor("manAtArms")).toEqual(["shieldBash"]);
        expect(optionsFor("mage")).toEqual(["frostBolt"]);
    });

    it("names an option by what it swaps in, and says what it swaps out", () => {
        expect(optionView("shieldBash")).toEqual({ icon: "✦", name: "Shield bash", line: `In place of Cleave · 2 AP · ${ABILITIES.shieldBash.description}` });
        expect(optionView("frostBolt")).toEqual({ icon: "❄️", name: "Frost bolt", line: "In place of the Bolt · 70% · range 10 · 2 damage · slowed on a hit" });
    });
});

describe("starterView", () => {
    it("shows the part of its own kit an option would swap out", () => {
        expect(starterView("manAtArms", "cleave")).toEqual({ icon: "✦", name: "Cleave", line: `2 AP · ${ABILITIES.cleave.description}` });
        expect(starterView("mage", "weapon")).toEqual({ icon: "🔥", name: "Bolt", line: "70% · range 10 · 3 damage" });
    });
});

describe("weaponMark", () => {
    it("leads a weapon with its character's mark, unless an option's weapon has its own", () => {
        expect(weaponMark("mage")).toBe("🔥");
        expect(weaponMark("mage", "frostBolt")).toBe("❄️");
        expect(weaponMark("archer", "cripplingShot")).toBe("🏹");
    });
});

describe("masteryLine", () => {
    it("counts down to the next rank, and stops at the last", () => {
        expect(masteryLine(0)).toBe("0 XP · 60 more for rank 1");
        expect(masteryLine(75)).toBe("75 XP · 105 more for rank 2");
        expect(masteryLine(450)).toBe("450 XP · the highest rank");
    });
});

describe("weaponLine", () => {
    it("says what a weapon leaves on a hit, when it leaves anything (§23.2)", () => {
        expect(weaponLine(kitOf("mage").weapon)).toBe("70% · range 10 · 3 damage");
        expect(weaponLine(kitOf("mage", "frostBolt").weapon)).toBe("70% · range 10 · 2 damage · slowed on a hit");
        expect(weaponLine(kitOf("knight").weapon)).toBe("Melee · 4 damage");
    });
});
