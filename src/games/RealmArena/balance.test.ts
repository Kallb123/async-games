import { describe, expect, it, vi } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield, type Battlefield } from "@/utils/games/battlefield/terrain";
import { buildTimeline } from "@/utils/games/replay";
import { ABILITIES, CHARACTERS, HOLD_OUT_ENEMY_STEPS, musterBudget, REALM, warbandBudget, FACTIONS, type CharacterId, type Difficulty } from "./characters";
import { cloneRealmArenaState, holdsOutStoutly, nextWaveOf, warbandBudgetOf, waveOf } from "./RealmArenaLogic";
import { buildInitialRealmArenaState, gameStateToModel, settingsOf, type RealmArenaSettings } from "./RealmArenaModels";
import { meta } from "./meta";
import {
    abilityRules, ACTION_POINTS, act, BALANCE_VERSION, battleFrom, check, fixedRolls, isBalanced, isLongShot, LONG_RANGE_PENALTY, LONG_RANGE_THIRDS, maxHpOf, MELEE_ACCURACY,
    newFighter, shotOdds, startTurn, stoutTeam, strikeChance, teamHp, TEAM_HP_FACTOR, viewOf, warbandOwner,
    type Action, type BattleState, type Fighter,
} from "./rules";
import { hitChance, reactionPreviews, rollsToHit } from "./tactics";
import { abilityWait, eventLines, hpFraction } from "./ui";
import { nextAction } from "./ai";
import { actBy, battleOf, endTurnBy, makeGame, musterAll, play, playScriptedBattle, type RealmArenaTestGame } from "./testFixtures";

// docs/games/realm-arena-balance.md: the rebalance that command version 7
// ships (`BALANCE_VERSION`). Each rule is tested on its own against a hand-built
// battle (`balanced`), and against one from before it (`rulesVersion: 6`),
// which must go on playing as it did.

const LEGACY = 6;

const fieldOf = (rows: string[]): Battlefield => buildBattlefield({ name: "Test field", rows, deployments: [], objectives: {} });
const OPEN = fieldOf(["..........", "..........", "..........", "..........", ".........."]);
/** A single row long enough for the longest shot. */
const ROW = fieldOf(["......................"]);

/** A character ready to act: full AP, as at the start of its owner's turn. */
function fighter(id: number, owner: string, character: CharacterId, square: number, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, square), ap: ACTION_POINTS, ...extra };
}

const balanced = (field: Battlefield, fighters: Fighter[]): BattleState => ({ field, fighters, balanced: true });
const legacy = (field: Battlefield, fighters: Fighter[]): BattleState => ({ field, fighters });

function run(state: BattleState, player: string, action: Action, rolls: number[] = []) {
    const outcome = act(state, player, action, fixedRolls(rolls));
    return { ...outcome, byId: (id: number) => outcome.fighters.find(one => one.id === id)! };
}

describe("the rules version a battle plays by", () => {
    it("is stamped on every new battle, and a battle is balanced from that version on", () => {
        expect(meta.commandVersion).toBeGreaterThanOrEqual(BALANCE_VERSION);
        expect([undefined, 0, 6].map(isBalanced)).toEqual([false, false, false]);
        expect([7, 8].map(isBalanced)).toEqual([true, true]);
        expect(stoutTeam("holdOut", 7)).toBe(true);
        expect([stoutTeam("holdOut", 6), stoutTeam(undefined, 7), stoutTeam("holdOut", undefined)]).toEqual([false, false, false]);
    });

    it("is read into the battle, and kept by a player's view of it and an undo's snapshot", () => {
        expect(battleFrom(OPEN, { fighters: [], rulesVersion: 7 }).balanced).toBe(true);
        expect(battleFrom(OPEN, { fighters: [], rulesVersion: LEGACY })).not.toHaveProperty("balanced");
        expect(battleFrom(OPEN, { fighters: [] })).not.toHaveProperty("balanced");
        expect(viewOf({ ...balanced(OPEN, []), fog: true }, "a").balanced).toBe(true);

        const game = makeGame();
        expect(cloneRealmArenaState(game.specificGameState).rulesVersion).toBe(meta.commandVersion);
        const old = makeGame(undefined, undefined, { rulesVersion: LEGACY });
        expect(cloneRealmArenaState(old.specificGameState).rulesVersion).toBe(LEGACY);
    });

    it("stamps a new battle, which its settings read back for a replay and the board is sent", () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut" } });
        expect(game.specificGameState.rulesVersion).toBe(meta.commandVersion);
        expect(buildInitialRealmArenaState(["a", "b"], {}, settingsOf(game.specificGameState)).rulesVersion).toBe(meta.commandVersion);
        expect(gameStateToModel(game.specificGameState, "a", null).rulesVersion).toBe(meta.commandVersion);
        expect(battleOf(game).balanced).toBe(true);

        // A battle from before the stamp has none, and goes on without one.
        const unstamped = buildInitialRealmArenaState(["a", "b"], {}, {});
        expect(unstamped).not.toHaveProperty("rulesVersion");
        expect(gameStateToModel(unstamped, "a", null)).not.toHaveProperty("rulesVersion");
        expect(battleFrom(OPEN, { fighters: [], rulesVersion: unstamped.rulesVersion })).not.toHaveProperty("balanced");
    });
});

describe("melee rolls to hit (§13.3)", () => {
    const knight = fighter(1, "a", "knight", at(OPEN, 1, 1));
    const archer = fighter(2, "b", "archer", at(OPEN, 2, 1));
    const state = balanced(OPEN, [knight, archer]);
    const attack: Action = { kind: "attack", fighter: 1, target: 2 };

    it("hits 80% of the time: a hit on 1–80 and a miss on 81–100, with no graze", () => {
        expect(MELEE_ACCURACY).toBe(80);
        expect(strikeChance(state, archer)).toBe(80);
        const hit = run(state, "a", attack, [80]);
        expect(hit.events).toEqual([{ kind: "struck", fighter: 1, target: 2, damage: 4, reaction: false, chance: 80, roll: 80 }]);
        expect(hit.byId(2).hp).toBe(CHARACTERS.archer.hp - 4);
        const miss = run(state, "a", attack, [81]);
        expect(miss.events).toEqual([{ kind: "struck", fighter: 1, target: 2, damage: 0, reaction: false, chance: 80, roll: 81, missed: true }]);
        expect(miss.byId(2).hp).toBe(CHARACTERS.archer.hp);
        // Still spends the AP.
        expect(miss.byId(1).ap).toBe(ACTION_POINTS - 2);
    });

    it("adds what is on the target to every attack at it, but not cover, height or smoke", () => {
        expect(strikeChance(state, { ...archer, effects: { marked: 2 } })).toBe(80 + 15);
        expect(strikeChance(state, { ...archer, effects: { corroded: 2 } })).toBe(80 + 10);
        expect(strikeChance(state, { ...archer, effects: { marked: 2, corroded: 2 } })).toBe(100);
        expect(strikeChance(state, { ...archer, effects: { hunkered: 1 } })).toBe(80);
        expect(run(state, "a", attack, [95]).byId(2).hp).toBe(CHARACTERS.archer.hp);
        expect(run({ ...state, fighters: [knight, { ...archer, effects: { marked: 2 } }] }, "a", attack, [95]).byId(2).hp).toBe(CHARACTERS.archer.hp - 4);
    });

    it("always hit, and rolled nothing, in a battle from before it", () => {
        expect(strikeChance(legacy(OPEN, []), archer)).toBe(100);
        const { events, byId } = run(legacy(OPEN, [knight, archer]), "a", attack);
        expect(events).toEqual([{ kind: "struck", fighter: 1, target: 2, damage: 4, reaction: false }]);
        expect(byId(2).hp).toBe(CHARACTERS.archer.hp - 4);
    });

    it("rolls once for each of a cleave's two blows", () => {
        const fighters = [fighter(1, "a", "manAtArms", at(OPEN, 1, 1)), fighter(2, "b", "archer", at(OPEN, 2, 1)), fighter(3, "b", "scout", at(OPEN, 1, 2))];
        const cleave: Action = { kind: "cleave", fighter: 1, targets: [2, 3] };
        const mixed = run(balanced(OPEN, fighters), "a", cleave, [10, 90]);
        expect(mixed.events.map(event => event.kind === "struck" && [event.target, event.damage, event.missed === true])).toEqual([[2, 4, false], [3, 0, true]]);
        expect(() => run(balanced(OPEN, fighters), "a", cleave, [10])).toThrow("Ran out of rolls");
        // Before it, a cleave rolled nothing.
        expect(run(legacy(OPEN, fighters), "a", cleave).events).toHaveLength(2);
    });

    it("stuns with a Shield bash only on a hit, and Rend rolls too", () => {
        const bash = fighter(1, "a", "manAtArms", at(OPEN, 1, 1), { option: "shieldBash" });
        const swarm = balanced(OPEN, [bash, archer]);
        const shieldBash: Action = { kind: "shieldBash", fighter: 1, target: 2 };
        expect(run(swarm, "a", shieldBash, [1]).byId(2)).toMatchObject({ hp: CHARACTERS.archer.hp - 2, effects: { stunned: 1 } });
        const missed = run(swarm, "a", shieldBash, [100]);
        expect(missed.byId(2)).toMatchObject({ hp: CHARACTERS.archer.hp, effects: {} });
        // A miss still costs the ability its cooldown.
        expect(missed.byId(1).cooldowns.shieldBash).toBe(ABILITIES.shieldBash.cooldown);

        const ravager = fighter(1, "a", "ravager", at(OPEN, 1, 1));
        const rend: Action = { kind: "rend", fighter: 1, target: 2 };
        expect(run(balanced(OPEN, [ravager, { ...archer, hp: 9 }]), "a", rend, [80]).byId(2).hp).toBe(9 - ABILITIES.rend.damage);
        expect(run(balanced(OPEN, [ravager, { ...archer, hp: 9 }]), "a", rend, [81]).byId(2).hp).toBe(9);
        expect(run(legacy(OPEN, [ravager, { ...archer, hp: 9 }]), "a", rend).byId(2).hp).toBe(9 - ABILITIES.rend.damage);
    });

    it("rolls a guard's strike when a mover steps beside it, and a miss leaves the mover whole", () => {
        const guard = fighter(1, "a", "knight", at(OPEN, 3, 1), { ap: 0, banked: 4 });
        const mover = fighter(2, "b", "scout", at(OPEN, 0, 1));
        const path = [at(OPEN, 0, 1), at(OPEN, 1, 1), at(OPEN, 2, 1)];
        const walk: Action = { kind: "move", fighter: 2, path };
        const onGuard = (rolls: number[], make = balanced) => run(make(OPEN, [guard, mover]), "b", walk, rolls);
        const hit = onGuard([80]);
        expect(hit.events.find(event => event.kind === "struck")).toMatchObject({ reaction: true, damage: 4, chance: 80, roll: 80 });
        expect(hit.byId(2).hp).toBe(CHARACTERS.scout.hp - 4);
        const miss = onGuard([81]);
        expect(miss.events.find(event => event.kind === "struck")).toMatchObject({ reaction: true, damage: 0, missed: true });
        expect(miss.byId(2).hp).toBe(CHARACTERS.scout.hp);
        // It still got where it was going, and the guard spent its reaction.
        expect(miss.byId(2).square).toBe(at(OPEN, 2, 1));
        expect(miss.byId(1).banked).toBe(2);
        // Before melee rolled, the guard always hit and drew no roll.
        expect(onGuard([], legacy).byId(2).hp).toBe(CHARACTERS.scout.hp - 4);
    });

    it("never rolls for a burst or a demolish, which land on everyone beside them", () => {
        const bloater = fighter(1, "a", "bloater", at(OPEN, 1, 1));
        const burst = run(balanced(OPEN, [bloater, archer]), "a", { kind: "burst", fighter: 1 });
        expect(burst.events.some(event => event.kind === "burst")).toBe(true);
        expect(burst.byId(2).hp).toBe(CHARACTERS.archer.hp - ABILITIES.burst.damage);
    });

    it("is what the board and the planner read: a strike's chance, in a list of targets and a guard's preview", () => {
        expect(hitChance(state, knight, archer)).toBe(80);
        expect(hitChance(legacy(OPEN, [knight, archer]), knight, archer)).toBe(100);
        expect(hitChance(state, knight, { ...archer, effects: { marked: 2 } })).toBe(95);
        expect(["attack", "aimedShot", "cripplingShot", "shieldBash", "rend", "cleave"].every(kind => rollsToHit(kind as Action["kind"]))).toBe(true);
        expect(["huntersMark", "heal", "raise", "fireball", "burst", "move"].some(kind => rollsToHit(kind as Action["kind"]))).toBe(false);
        const guard = fighter(3, "b", "knight", at(OPEN, 3, 1), { ap: 0, banked: 4 });
        const mover = fighter(4, "a", "scout", at(OPEN, 0, 1));
        const previews = reactionPreviews(balanced(OPEN, [guard, mover]), mover, [at(OPEN, 0, 1), at(OPEN, 1, 1), at(OPEN, 2, 1)]);
        expect(previews).toMatchObject([{ kind: "guard", chance: 80, damage: 4 }]);
    });

    it("is told as a miss in the review's lines, with the odds and the roll while they're known", () => {
        const names = (userId: string) => userId;
        const missed = { kind: "struck", fighter: 1, target: 2, damage: 0, reaction: false, chance: 80, roll: 91, missed: true } as const;
        const [line] = eventLines([missed], [knight, archer], "a", names);
        expect(line).toMatchObject({ title: "Miss", roll: 91, sub: "80% to hit" });
        const { roll: _roll, ...told } = missed;
        expect(eventLines([told], [knight, archer], "a", names)[0]).not.toHaveProperty("roll");
        expect(eventLines([{ kind: "struck", fighter: 1, target: 2, damage: 4, reaction: false }], [knight, archer], "a", names)[0].title).toContain("for 4");
    });
});

describe("long shots (§13.3)", () => {
    it("measures a long shot as more than two thirds of the weapon's range, in whole numbers", () => {
        expect(LONG_RANGE_THIRDS).toBe(2);
        expect(LONG_RANGE_PENALTY).toBe(20);
        // 12 squares of range: 8 is exactly two thirds, 9 is over.
        expect([8, 9].map(away => isLongShot(away, 12))).toEqual([false, true]);
        expect([13, 14].map(away => isLongShot(away, 20))).toEqual([false, true]);
        expect([6, 7].map(away => isLongShot(away, 10))).toEqual([false, true]);
    });

    const odds = (shooter: CharacterId, away: number, kind?: "attack" | "aimedShot" | "overwatch" | "cripplingShot", state = balanced) => {
        const from = fighter(1, "a", shooter, at(ROW, 0, 0));
        const target = fighter(2, "b", "knight", at(ROW, away, 0));
        return shotOdds(state(ROW, [from, target]), from, target, kind);
    };

    it("takes 20 off an Archer's bow past 13 squares, and shows that it did", () => {
        expect(odds("archer", 13)).toMatchObject({ chance: 80, longShot: false });
        expect(odds("archer", 14)).toMatchObject({ chance: 60, longShot: true });
        expect(odds("archer", 20)).toMatchObject({ chance: 60, longShot: true });
        expect(odds("archer", 21)).toBeUndefined();
    });

    it("takes 20 off a Mage's bolt, a Frost bolt and a Spitter's acid at their own two thirds", () => {
        expect(odds("mage", 6)).toMatchObject({ chance: 70, longShot: false });
        expect(odds("mage", 7)).toMatchObject({ chance: 50, longShot: true });
        expect(odds("spitter", 8)).toMatchObject({ chance: 70, longShot: false });
        expect(odds("spitter", 9)).toMatchObject({ chance: 50, longShot: true });
        const frost = fighter(1, "a", "mage", at(ROW, 0, 0), { option: "frostBolt" });
        const target = fighter(2, "b", "knight", at(ROW, 9, 0));
        expect(shotOdds(balanced(ROW, [frost, target]), frost, target)).toMatchObject({ chance: 50, longShot: true });
    });

    it("applies to an aimed shot, a crippling shot and overwatch, on top of everything else", () => {
        expect(odds("archer", 14, "aimedShot")?.chance).toBe(80 + 20 - 20);
        expect(odds("archer", 14, "cripplingShot")?.chance).toBe(60);
        expect(odds("archer", 14, "overwatch")?.chance).toBe(80 - 15 - 20);
        // It moves the graze band with it, like any other penalty.
        expect(odds("archer", 14)).toMatchObject({ chance: 60, grazeChance: 10 });
    });

    it("is a shot's, so a strike has none, and a battle from before it has none either", () => {
        expect(odds("archer", 20, "attack", legacy)).toMatchObject({ chance: 80, longShot: false });
        expect(odds("mage", 10, "attack", legacy)?.chance).toBe(70);
    });

    it("reaches the board's list of targets and the planner's odds", () => {
        const from = fighter(1, "a", "archer", at(ROW, 0, 0));
        const target = fighter(2, "b", "knight", at(ROW, 15, 0));
        expect(hitChance(balanced(ROW, [from, target]), from, target)).toBe(60);
    });
});

describe("Heal, once a turn (§13.6)", () => {
    const wide = fieldOf(["..........."]);
    const cleric = fighter(1, "a", "cleric", at(wide, 0, 0));
    const hurt = (id: number, at_: number) => fighter(id, "a", "knight", at(wide, at_, 0), { hp: 5 });
    const heal = (target: number): Action => ({ kind: "heal", fighter: 1, target });

    it("has no cooldown but is limited to once a turn", () => {
        expect(ABILITIES.heal.cooldown).toBe(0);
        expect(ABILITIES.heal.oncePerTurn).toBe(true);
        expect(abilityRules({ balanced: true }, "heal")).toEqual({ cooldown: 0, oncePerBattle: undefined, oncePerTurn: true });
    });

    it("can't be used a second time in a turn, on anyone, and is ready at the start of the next", () => {
        const first = run(balanced(wide, [cleric, hurt(2, 2), hurt(3, 4)]), "a", heal(2));
        expect(first.byId(1)).toMatchObject({ cooldowns: {}, usedThisTurn: ["heal"] });
        const after = balanced(wide, [{ ...first.byId(1), ap: ACTION_POINTS }, first.byId(2), first.byId(3)]);
        expect(check(after, "a", heal(3))).toEqual({ refused: "Heal has been used this turn" });
        expect(abilityWait(first.byId(1), "heal")).toBe("Used this turn");
        // Another turn begins for its owner: it can heal again straight away.
        const next = startTurn(after, "a").fighters;
        expect(next[0]).not.toHaveProperty("usedThisTurn");
        expect(check({ ...after, fighters: next }, "a", heal(3))).toEqual({ ap: 2 });
        expect(abilityWait(next[0], "heal")).toBeUndefined();
        // Another Cleric's turn doesn't reset it.
        expect(startTurn(after, "b").fighters[0].usedThisTurn).toEqual(["heal"]);
    });

    it("kept its two-turn cooldown, and no once-a-turn limit, in a battle from before it", () => {
        expect(abilityRules({}, "heal")).toEqual({ cooldown: 2, oncePerBattle: undefined, oncePerTurn: undefined });
        const first = run(legacy(wide, [cleric, hurt(2, 2), hurt(3, 4)]), "a", heal(2));
        expect(first.byId(1)).toMatchObject({ cooldowns: { heal: 2 } });
        expect(first.byId(1)).not.toHaveProperty("usedThisTurn");
        const again = legacy(wide, [{ ...first.byId(1), ap: ACTION_POINTS }, first.byId(2), first.byId(3)]);
        expect(check(again, "a", heal(3))).toEqual({ refused: "Heal isn't ready yet" });
    });

    it("is a Regrowth's too if it says so: nothing else gains the limit", () => {
        const broodmother = fighter(1, "a", "broodmother", at(wide, 0, 0));
        const twice = run(balanced(wide, [broodmother, fighter(2, "a", "ravager", at(wide, 2, 0), { hp: 2 })]), "a", { kind: "regrowth", fighter: 1, target: 2 });
        expect(twice.byId(1)).not.toHaveProperty("usedThisTurn");
        expect(twice.byId(1).cooldowns).toEqual({ regrowth: ABILITIES.regrowth.cooldown });
    });
});

describe("Raise, on a cooldown (§13.6)", () => {
    const fighters = [fighter(1, "a", "cleric", at(OPEN, 1, 1)), fighter(2, "a", "knight", at(OPEN, 2, 2), { hp: 0, ap: 0 })];

    it("is no longer once a battle: a cooldown of four turns instead", () => {
        expect(ABILITIES.raise).not.toHaveProperty("oncePerBattle");
        expect(abilityRules({ balanced: true }, "raise")).toMatchObject({ cooldown: 4 });
        const { byId } = run(balanced(OPEN, fighters), "a", { kind: "raise", fighter: 1, target: 2 });
        expect(byId(1)).toMatchObject({ spent: [], cooldowns: { raise: 4 } });
        expect(abilityWait(byId(1), "raise")).toBe("Back in 4 turns");
    });

    it("stayed once a battle, with no cooldown, in a battle from before it", () => {
        expect(abilityRules({}, "raise")).toEqual({ cooldown: 0, oncePerBattle: true, oncePerTurn: undefined });
        const { byId } = run(legacy(OPEN, fighters), "a", { kind: "raise", fighter: 1, target: 2 });
        expect(byId(1)).toMatchObject({ spent: ["raise"], cooldowns: {} });
        const again = legacy(OPEN, [{ ...byId(1), ap: ACTION_POINTS }, { ...byId(2), hp: 0 }]);
        expect(check(again, "a", { kind: "raise", fighter: 1, target: 2 })).toEqual({ refused: "Raise has been used this battle" });
    });
});

describe("the team's HP in Hold Out", () => {
    it("is its character's HP times 1.5, rounded up, and read everywhere through maxHpOf", () => {
        expect(TEAM_HP_FACTOR).toBe(1.5);
        expect(Object.fromEntries((["manAtArms", "knight", "archer", "scout", "mage", "cleric"] as const).map(id => [id, teamHp(id)])))
            .toEqual({ manAtArms: 12, knight: 18, archer: 9, scout: 9, mage: 8, cleric: 11 });
        expect(maxHpOf({ character: "knight" })).toBe(CHARACTERS.knight.hp);
        expect(maxHpOf({ character: "knight", maxHp: 18 })).toBe(18);
        expect(newFighter(1, "a", "knight", 0, null, undefined, 18)).toMatchObject({ hp: 18, maxHp: 18 });
        expect(newFighter(1, "a", "knight", 0)).not.toHaveProperty("maxHp");
    });

    it("lets a heal, a draught and a Purify fill the bigger bar, and a raise stand a character at half of it", () => {
        const field = OPEN;
        const knight = fighter(2, "a", "knight", at(field, 2, 1), { hp: 10, maxHp: 18 });
        const state = balanced(field, [fighter(1, "a", "cleric", at(field, 1, 1), { maxHp: 11 }), knight]);
        // Not at full health at 12/12 any more.
        expect(check({ ...state, fighters: [state.fighters[0], { ...knight, hp: 12 }] }, "a", { kind: "heal", fighter: 1, target: 2 })).toEqual({ ap: 2 });
        expect(check({ ...state, fighters: [state.fighters[0], { ...knight, hp: 18 }] }, "a", { kind: "heal", fighter: 1, target: 2 })).toEqual({ refused: "Already at full health" });
        expect(run(state, "a", { kind: "heal", fighter: 1, target: 2 }).byId(2).hp).toBe(14);
        expect(run({ ...state, fighters: [state.fighters[0], { ...knight, hp: 16 }] }, "a", { kind: "heal", fighter: 1, target: 2 }).events[0]).toMatchObject({ hp: 2 });

        const purify = fighter(1, "a", "cleric", at(field, 1, 1), { option: "purify", hp: 9, maxHp: 11 });
        expect(run(balanced(field, [purify, knight]), "a", { kind: "purify", fighter: 1 }).byId(1).hp).toBe(11);

        const fallen = { ...knight, hp: 0, ap: 0 };
        expect(run(balanced(field, [state.fighters[0], fallen]), "a", { kind: "raise", fighter: 1, target: 2 }).byId(2).hp).toBe(9);
        // The board's bars fill to the bigger number.
        expect(hpFraction(knight)).toBeCloseTo(10 / 18);
        expect(hpFraction({ ...knight, hp: 18 })).toBe(1);
    });

    it("is for the team only, in Hold Out only, and only under the rules that give it", async () => {
        const stout = async (settings: RealmArenaSettings) => {
            const game = makeGame(["a", "b"], {}, settings);
            await musterAll(game);
            return game.specificGameState.fighters;
        };
        const holdOut = { coop: { enemy: "realm" as const, mission: "holdOut" as const } };

        const fighters = await stout(holdOut);
        for (const one of fighters) {
            if (one.owner.startsWith("ai:")) expect(one, "a warband's keeps its HP").toMatchObject({ hp: CHARACTERS[one.character].hp }), expect(one).not.toHaveProperty("maxHp");
            else expect(one).toMatchObject({ hp: teamHp(one.character), maxHp: teamHp(one.character) });
        }
        expect(fighters.some(one => !one.owner.startsWith("ai:"))).toBe(true);

        // Hold the Centre, a duel and a free-for-all are as they were, and so is Hold Out from before.
        for (const settings of [{ coop: { enemy: "realm" as const } }, {}, { rulesVersion: LEGACY, ...holdOut }]) {
            for (const one of await stout(settings)) {
                expect(one).not.toHaveProperty("maxHp");
                expect(one.hp).toBe(CHARACTERS[one.character].hp);
            }
        }
        const ring = makeGame(["a", "b", "c"], {});
        await musterAll(ring);
        expect(ring.specificGameState.fighters.every(one => one.hp === CHARACTERS[one.character].hp)).toBe(true);
    });

    it("rallies to the bigger bar, and its muster sheet tells the same HP", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut" } });
        await musterAll(game);
        const gs = game.specificGameState;
        expect(holdsOutStoutly(gs)).toBe(true);
        gs.roundsPlayed = 2;
        gs.fighters.forEach(one => { if (one.owner.startsWith("ai:")) one.hp = 0; });
        const [first] = gs.fighters.filter(one => !one.owner.startsWith("ai:"));
        first.hp = 1;
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        expect(gs.roundsPlayed).toBe(3);
        const rallied = gs.fighters.find(one => one.id === first.id)!;
        // Half the bigger bar, rounded down: more than half the table's would give.
        expect(rallied.hp).toBe(1 + Math.floor(maxHpOf(rallied) / 2));
        expect(rallied.hp).toBeGreaterThan(1 + Math.floor(CHARACTERS[rallied.character].hp / 2) - 1);
    });
});

describe("Hold Out's warbands, a step smaller", () => {
    it("muster one rung down the ladder, stopping at its bottom", () => {
        expect(HOLD_OUT_ENEMY_STEPS).toBe(-1);
        expect(warbandBudget(2, "normal", "normal")).toBe(80);
        expect(warbandBudget(2, "normal", "normal", HOLD_OUT_ENEMY_STEPS)).toBe(70);
        expect(warbandBudget(3, "normal", "hard", HOLD_OUT_ENEMY_STEPS)).toBe(90);
        expect(warbandBudget(3, "normal", "easy", HOLD_OUT_ENEMY_STEPS)).toBe(60);
        // Nothing below 50 to step down to, and nothing past 120 to climb to.
        expect(warbandBudget(3, "small", "easy", HOLD_OUT_ENEMY_STEPS)).toBe(50);
        expect(musterBudget(3, true, "small")).toBe(60);
        expect(warbandBudget(3, "large", "hard", 5)).toBe(120);
    });

    it("applies to the first muster, to a wave's refill and to the count told of the next wave", async () => {
        for (const difficulty of ["easy", "normal", "hard"] as Difficulty[]) {
            const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut", ...(difficulty === "normal" ? {} : { difficulty }) } });
            const gs = game.specificGameState;
            const normal = warbandBudget(2, "normal", difficulty);
            const smaller = warbandBudget(2, "normal", difficulty, -1);
            expect(warbandBudgetOf(gs)).toBe(smaller);
            expect(smaller).toBeLessThanOrEqual(normal);

            await musterAll(game);
            const band = gs.fighters.filter(one => one.owner === warbandOwner(0)).map(one => one.character);
            expect(band).toEqual([...REALM.readyMade[smaller]]);
            // A wave brings back the smaller squad.
            gs.fighters.filter(one => one.owner === warbandOwner(0)).forEach(one => { one.hp = 0; });
            expect(waveOf(gs, warbandOwner(0), true).map(one => one.character)).toEqual([...REALM.readyMade[smaller]]);
            // And the next wave is told as bringing the smaller squad, plus the one more (the other warband is whole, so brings just that).
            gs.roundsPlayed = 2;
            expect(nextWaveOf(gs)).toMatchObject({ round: 4 });
            expect(nextWaveOf(gs)?.arriving).toBe(REALM.readyMade[smaller].length + 1 + 1);
            gs.roundsPlayed = 0;
        }
    });

    it("leaves Hold the Centre, and Hold Out from before it, at the difficulty's budget", async () => {
        const centre = makeGame(["a", "b"], {}, { coop: { enemy: "swarm" } });
        expect(warbandBudgetOf(centre.specificGameState)).toBe(warbandBudget(2));
        const before = makeGame(["a", "b"], {}, { rulesVersion: LEGACY, coop: { enemy: "swarm", mission: "holdOut", difficulty: "hard" } });
        expect(warbandBudgetOf(before.specificGameState)).toBe(warbandBudget(2, "normal", "hard"));
        await musterAll(before);
        const band = before.specificGameState.fighters.filter(one => one.owner === warbandOwner(0)).map(one => one.character);
        expect(band).toEqual([...FACTIONS.swarm.readyMade[warbandBudget(2, "normal", "hard")]]);
    });
});

describe("a battle begun before the rebalance", () => {
    it("plays to its end by the old rules, and replays exactly without drawing a roll", async () => {
        const settings: RealmArenaSettings = { rulesVersion: LEGACY, coop: { enemy: "realm", mission: "holdOut" } };
        const game = await playScriptedBattle(settings);
        const rolls = game.gameState.commandHistory.flatMap(command => (command as { recordedRolls?: number[] }).recordedRolls ?? []);
        expect(rolls.length).toBeGreaterThan(0);
        expect(game.specificGameState.fighters.every(one => !("maxHp" in one))).toBe(true);
        expect(game.specificGameState.rulesVersion).toBe(LEGACY);

        const consumed = () => { throw new Error("replay consumed randomness"); };
        const entropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(consumed);
        try {
            const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, null);
            expect(timeline.snapshots).toHaveLength(game.gameState.commandHistory.length + 1);
            expect(timeline.snapshots[timeline.currentIndex].specificGameState).toEqual(gameStateToModel(game.specificGameState, null, game.gameState.commandHistory.at(-1)?.id ?? null, game.complete));
        } finally {
            entropy.mockRestore();
        }
    }, 60_000);

    it("keeps its melee un-rolled through the command, where the same fight rolls in a new one", async () => {
        const fight = async (rulesVersion: number): Promise<RealmArenaTestGame> => {
            const game = makeGame(["a", "b"], {}, { rulesVersion });
            await musterAll(game);
            const [attacker] = game.specificGameState.fighters.filter(one => one.owner === "a" && one.character === "knight");
            const [target] = game.specificGameState.fighters.filter(one => one.owner === "b" && one.character === "knight");
            const { field } = battleOf(game);
            target.square = field.tiles.findIndex((tile, square) => tile.terrain.standable && square !== attacker.square
                && !("refused" in check({ field, fighters: [attacker, { ...target, square }] }, "a", { kind: "attack", fighter: attacker.id, target: target.id })));
            return game;
        };
        for (const [version, rolls] of [[LEGACY, undefined], [meta.commandVersion!, [100]]] as const) {
            const game = await fight(version);
            const [attacker] = game.specificGameState.fighters.filter(one => one.owner === "a" && one.character === "knight");
            const [target] = game.specificGameState.fighters.filter(one => one.owner === "b" && one.character === "knight");
            const command = Object.assign(actBy("a", { kind: "attack", fighter: attacker.id, target: target.id }), rolls ? { recordedRolls: [...rolls] } : {});
            expect((await play(game, command)).outcome.validMove).toBe(true);
            const fresh = game.specificGameState.fighters.find(one => one.id === target.id)!;
            // A roll of 100 misses 80%, and is not even asked for in a battle from before it.
            expect(fresh.hp, `version ${version}`).toBe(rolls ? CHARACTERS.knight.hp : CHARACTERS.knight.hp - 4);
            expect(command.recordedRolls, `version ${version}`).toEqual(rolls);
        }
    });
});

describe("the computer, under the rebalance", () => {
    it("takes a strike's chance to land into account: a character near to downing an archer doesn't prefer a worse strike", () => {
        // A Knight beside an Archer on 4 HP, and nothing else around: it attacks.
        const knight = fighter(1, warbandOwner(0), "knight", at(OPEN, 1, 1));
        const archer = fighter(2, "a", "archer", at(OPEN, 2, 1), { hp: 4 });
        const view = { ...balanced(OPEN, [knight, archer]), sides: { a: "team", [warbandOwner(0)]: "enemy" } };
        expect(nextAction(view, warbandOwner(0), 1)).toMatchObject({ kind: "attack", fighter: 1, target: 2 });
    });

    it("values a team character's HP by its bigger bar", () => {
        const knight = fighter(1, warbandOwner(0), "knight", at(OPEN, 1, 1));
        const small = fighter(2, "a", "archer", at(OPEN, 2, 1), { hp: 3 });
        const sturdy = fighter(3, "a", "archer", at(OPEN, 1, 2), { hp: 3, maxHp: 9 });
        const view = { ...balanced(OPEN, [knight, small, sturdy]), sides: { a: "team", [warbandOwner(0)]: "enemy" } };
        // A kill is worth more than a scratch: it goes for the one it can down.
        expect(nextAction(view, warbandOwner(0), 1)).toMatchObject({ kind: "attack", target: 2 });
    });
});
