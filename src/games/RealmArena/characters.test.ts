import { rulesetFor } from "./rulesets";
import { describe, expect, it } from "vitest";
import { ABILITIES, BUDGETS, CHARACTERS, COOP_PLAYERS, coopTeamMax, enemyNameOf, FACTIONS, fitsCoop, musterBudget, squadPoints, UNKNOWN_ENEMY, warbandBudget, type BattleSize, type CharacterId, type Difficulty } from "./characters";

describe("the first faction's characters (§13.6)", () => {
    it("each have 5–12 HP and abilities that exist", () => {
        for (const character of FACTIONS.realm.characters.map(id => CHARACTERS[id])) {
            expect(character.hp, character.name).toBeGreaterThanOrEqual(5);
            expect(character.hp, character.name).toBeLessThanOrEqual(12);
            for (const ability of character.abilities) expect(ABILITIES[ability], `${character.name}: ${ability}`).toBeDefined();
        }
    });

    it("let a Man-at-arms down a Mage in one turn, as §13.2's balance note says", () => {
        expect(2 * CHARACTERS.manAtArms.weapon.damage).toBeGreaterThanOrEqual(CHARACTERS.mage.hp);
    });
});

describe("the Swarm's characters (§31)", () => {
    const swarm = FACTIONS.swarm.characters.map(id => CHARACTERS[id]);

    it("each have 4–10 HP and abilities that exist", () => {
        for (const character of swarm) {
            expect(character.hp, character.name).toBeGreaterThanOrEqual(4);
            expect(character.hp, character.name).toBeLessThanOrEqual(10);
            for (const ability of character.abilities) expect(ABILITIES[ability], `${character.name}: ${ability}`).toBeDefined();
        }
    });

    it("are cheaper than the Realm's, so a ready-made squad fields more of them for the same points", () => {
        const dearest = Math.max(...swarm.map(character => character.points));
        expect(dearest).toBeLessThan(Math.max(...FACTIONS.realm.characters.map(id => CHARACTERS[id].points)));
        for (const budget of BUDGETS) expect(FACTIONS.swarm.readyMade[budget].length, `${budget}`).toBeGreaterThan(FACTIONS.realm.readyMade[budget].length);
    });
});

describe("the Miners' characters (§33)", () => {
    const miners = FACTIONS.miners.characters.map(id => CHARACTERS[id]);
    const realm = FACTIONS.realm.characters.map(id => CHARACTERS[id]);

    it("each have 9–15 HP, hit no harder than the Realm's, and have abilities that exist", () => {
        const hardest = Math.max(...realm.map(character => character.weapon.damage));
        for (const character of miners) {
            expect(character.hp, character.name).toBeGreaterThanOrEqual(9);
            expect(character.hp, character.name).toBeLessThanOrEqual(15);
            expect(character.weapon.damage, character.name).toBeLessThanOrEqual(hardest);
            for (const ability of character.abilities) expect(ABILITIES[ability], `${character.name}: ${ability}`).toBeDefined();
        }
    });

    it("are dearer for their HP than the Realm's, so a ready-made squad fields fewer of them, and from 70 points up more HP in all", () => {
        const hpOf = (squad: readonly CharacterId[]) => squad.reduce((total, id) => total + CHARACTERS[id].hp, 0);
        for (const budget of BUDGETS) {
            expect(FACTIONS.miners.readyMade[budget].length, `${budget}`).toBeLessThan(FACTIONS.realm.readyMade[budget].length);
            if (budget >= 70) expect(hpOf(FACTIONS.miners.readyMade[budget]), `${budget}`).toBeGreaterThan(hpOf(FACTIONS.realm.readyMade[budget]));
        }
    });
});

describe("the factions (§29.3)", () => {
    it("muster every character, each for one faction alone", () => {
        const rosters = Object.values(FACTIONS).flatMap(faction => faction.characters);
        expect([...rosters].sort()).toEqual((Object.keys(CHARACTERS) as CharacterId[]).filter(id => id !== "scout").sort());
    });

    describe.each(Object.values(FACTIONS))("$name's ready-made squads (§17.2, §30.5)", faction => {
        it.each([...BUDGETS])("spend the whole %i-point budget, from its own roster", budget => {
            expect(squadPoints(faction.readyMade[budget])).toBe(budget);
            expect(faction.readyMade[budget].filter(character => !faction.characters.includes(character))).toEqual([]);
        });
    });

    it("keep the Realm's squads every battle before battle sizes mustered, which a replay musters again", () => {
        const oldRealm = rulesetFor(7).FACTIONS.realm;
        expect(oldRealm.readyMade[70]).toEqual(["manAtArms", "manAtArms", "archer", "scout"]);
        expect(oldRealm.readyMade[80]).toEqual(["knight", "manAtArms", "archer", "scout"]);
        expect(oldRealm.readyMade[100]).toEqual(["knight", "manAtArms", "manAtArms", "archer", "cleric"]);
    });

    it("name the enemy by its faction once it's known, and as the enemy until then", () => {
        expect(enemyNameOf("realm")).toBe("the Renegades");
        expect(enemyNameOf(undefined)).toBe(UNKNOWN_ENEMY);
    });
});

describe("budgets (§13.6, §30.5)", () => {
    const SIZES: BattleSize[] = ["small", "normal", "large"];
    const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

    it("are what every battle before battle sizes mustered, at normal size and difficulty", () => {
        expect([2, 3, 4].map(players => musterBudget(players, false))).toEqual([100, 80, 70]);
        expect([2, 3, 4].map(players => musterBudget(players, true))).toEqual([80, 80, 80]);
        expect([2, 3, 4].map(players => warbandBudget(players))).toEqual([80, 80, 80]);
    });

    it("give the plan's warbands at a normal size: 70, 80 or 100 points", () => {
        expect(DIFFICULTIES.map(difficulty => warbandBudget(2, "normal", difficulty))).toEqual([70, 80, 100]);
    });

    it("land on a rung with a ready-made squad, for every party, size and difficulty", () => {
        for (const size of SIZES) {
            for (const players of [2, 3, 4]) expect(BUDGETS, `${players} players, ${size}`).toContain(musterBudget(players, false, size));
            for (const difficulty of DIFFICULTIES) expect(BUDGETS, `co-op, ${size}, ${difficulty}`).toContain(warbandBudget(2, size, difficulty));
        }
    });

    it("grow with the battle's size, and the warbands with the difficulty", () => {
        for (const players of [2, 3, 4]) {
            const [small, normal, large] = SIZES.map(size => musterBudget(players, false, size));
            expect(small).toBeLessThan(normal);
            expect(large).toBeGreaterThan(normal);
        }
        for (const size of SIZES) {
            const [easy, normal, hard] = DIFFICULTIES.map(difficulty => warbandBudget(2, size, difficulty));
            expect(easy).toBeLessThan(normal);
            expect(normal).toBe(musterBudget(2, true, size));
            expect(hard).toBeGreaterThan(normal);
        }
    });
});

describe("the teams a co-op setting seats (§29.1, §37)", () => {
    const LINE = [{}, { mission: "holdOut" }, { mission: "holdOut", map: undefined }];

    it("is three, but for Hold Out on a battlefield of its own that has a version for four", () => {
        expect(COOP_PLAYERS).toEqual({ min: 1, max: 4 });
        for (const setting of LINE) expect(coopTeamMax(setting), JSON.stringify(setting)).toBe(3);
        // A map picked for Hold the Centre is no map: the mission decides.
        expect(coopTeamMax({ map: "sackedFort" })).toBe(3);
        expect(coopTeamMax({ mission: "holdOut", map: "sackedFort" })).toBe(4);
        expect(coopTeamMax({ mission: "holdOut", map: "sunkenVillage" })).toBe(4);
    });

    it("fits a team of one to the setting's most, and refuses four anywhere but Hold Out on its own battlefields", () => {
        for (const setting of LINE) {
            expect([0, 1, 2, 3, 4].map(players => fitsCoop(players, setting)), JSON.stringify(setting)).toEqual([false, true, true, true, false]);
        }
        for (const map of ["sackedFort", "sunkenVillage"] as const) {
            expect([0, 1, 2, 3, 4, 5].map(players => fitsCoop(players, { mission: "holdOut", map }))).toEqual([false, true, true, true, true, false]);
        }
    });
});
