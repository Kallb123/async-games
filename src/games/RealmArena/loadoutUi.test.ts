import { describe, expect, it } from "vitest";
import { loadoutLine, loadoutOf, optionsFor, optionView, unlocksFor, withPick } from "./roster";
import { characterStats } from "./stats";

// docs/games/realm-arena.md §40.4: what the screens say about a loadout, in
// rules version 12; version 11 and older read as they always have.

const V12 = { rulesVersion: 12 };
const V11 = { rulesVersion: 11 };

describe("withPick", () => {
    it("takes the ability last", () => {
        expect(withPick(["a", "b"] as never, "c" as never, 3)).toEqual(["a", "b", "c"]);
    });

    it("drops the one taken longest ago to stay picks long", () => {
        expect(withPick(["cleave", "leap"], "shove", 2)).toEqual(["leap", "shove"]);
    });

    it("moves one already taken to the end rather than doubling it", () => {
        expect(withPick(["cleave", "leap"], "cleave", 2)).toEqual(["leap", "cleave"]);
    });
});

describe("loadoutOf and loadoutLine", () => {
    it("read the defaults when nothing was picked, in pool order", () => {
        expect(loadoutOf({ character: "archer" }, V12)).toEqual(["aimedShot", "poisonArrow"]);
        expect(loadoutLine({ character: "archer" }, V12)).toBe("Aimed shot · Poison Arrow");
    });

    it("read a figure's own pick, named in pool order whatever order it was taken in", () => {
        const picked = { character: "archer" as const, loadout: ["poisonArrow", "shootDodge"] as never };
        expect(loadoutOf(picked, V12)).toEqual(["poisonArrow", "shootDodge"]);
        const line = loadoutLine(picked, V12)!;
        expect(line).toBe("Poison Arrow · Shoot + Dodge");
    });

    it("say nothing for a character with no pool, or before version 12", () => {
        expect(loadoutLine({ character: "scout" }, V12)).toBeUndefined();
        expect(loadoutLine({ character: "archer" }, V11)).toBeUndefined();
        expect(loadoutOf({ character: "archer" }, V11)).toBeUndefined();
    });
});

describe("optionsFor", () => {
    it("offers only the weapon swap to a character with a pool", () => {
        expect(optionsFor("mage", V12)).toEqual(["frostBolt"]);
        expect(unlocksFor("mage", V12)).toContain("frostBolt");
    });

    it("keeps an ability option as a pool entry rather than a swap", () => {
        expect(optionsFor("archer", V12)).toEqual([]);
        expect(unlocksFor("archer", V12)).toEqual(["cripplingShot"]);
    });

    it("still lists every option as a swap in version 11", () => {
        expect(optionsFor("archer", V11)).toEqual(["cripplingShot"]);
        expect(optionsFor("mage", V11)).toEqual(["frostBolt"]);
    });
});

describe("optionView", () => {
    it("says an ability option joins a pool character's picks", () => {
        expect(optionView("cripplingShot", V12).line).toMatch(/^Joins its picks · \d AP · /);
    });

    it("still says what it replaces in version 11", () => {
        expect(optionView("cripplingShot", V11).line).toMatch(/^In place of /);
    });
});

describe("characterStats", () => {
    it("marks a pool character's fixed abilities Always and the rest as picks", () => {
        const { actions, options } = characterStats("knight", V12);
        const kinds = Object.fromEntries(actions.map(action => [action.name, action.kind]));
        expect(kinds["Bulwark"]).toBe("Always");
        expect(kinds["Taunt"]).toBe("Pick 2");
        expect(kinds["Demolish"]).toBe("Rank 1 · pick");
        expect(options).toEqual([]);
    });

    it("lists only a weapon option as a swap", () => {
        const { options } = characterStats("mage", V12);
        expect(options.map(option => option.name)).toEqual(["Frost bolt"]);
    });

    it("keeps version 11's sheet as it was", () => {
        const { actions, options } = characterStats("knight", V11);
        expect(actions.filter(action => action.kind === "Ability")).toHaveLength(actions.length - 1);
        expect(options[0].kind).toMatch(/^Rank 1 · in place of /);
    });
});
