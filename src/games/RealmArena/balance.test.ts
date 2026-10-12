import { describe, expect, it, vi } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield, type Battlefield } from "@/utils/games/battlefield/terrain";
import { buildTimeline } from "@/utils/games/replay";
import { ABILITIES, CHARACTERS, HOLD_OUT_ENEMY_STEPS, musterBudget, REALM, warbandBudget, FACTIONS, type CharacterId, type Difficulty, type FactionId } from "./characters";
import { battleRoundsOf, cloneRealmArenaState, nextWaveOf, RealmArenaGameType, warbandBudgetOf, waveOf, type IRealmArenaOutcome } from "./RealmArenaLogic";
import { buildInitialRealmArenaState, gameStateToModel, settingsOf, stepOutcomeToModel, type RealmArenaSettings } from "./RealmArenaModels";
import { meta } from "./meta";
import {
    abilityRules, ACTION_POINTS, battleRounds, HOLD_OUT_PAIR_ROUNDS, lastWaveRound, waveArrives, isBattleOver, act, ARMOUR, armouredTeam, armourOf, damageTo, weaponOf, weaponReaches, BALANCE_VERSION, battleFrom, check, fixedRolls, isBalanced, FAR_SHOT_DISTANCE, maxHpOf, MELEE_ACCURACY,
    musterHp, newFighter, shotOdds, startTurn, stoutTeam, strikeChance, teamHp, TEAM_HP_FACTOR, viewOf, warbandOwner,
    type Action, type BattleState, type Fighter,
} from "./rules";
import { hitChance, rangeSquares, reactionPreviews, rollsToHit } from "./tactics";
import { characterStats } from "./stats";
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
const OPEN_LONG = fieldOf([".".repeat(24), ".".repeat(24), ".".repeat(24)]);

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

/** A battle on a's first turn with a's Knight standing beside b's, ready to strike. */
async function knightsBeside(rulesVersion: number) {
    const game = makeGame(["a", "b"], {}, { rulesVersion });
    await musterAll(game);
    const [attacker] = game.specificGameState.fighters.filter(one => one.owner === "a" && one.character === "knight");
    const [target] = game.specificGameState.fighters.filter(one => one.owner === "b" && one.character === "knight");
    const { field } = battleOf(game);
    target.square = field.tiles.findIndex((tile, square) => tile.terrain.standable && square !== attacker.square
        && !("refused" in check({ field, fighters: [attacker, { ...target, square }] }, "a", { kind: "attack", fighter: attacker.id, target: target.id })));
    return { game, attacker, target };
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

    it("keeps a strike's roll out of the review a viewer is sent, as it does a shot's", async () => {
        const { game, attacker, target } = await knightsBeside(meta.commandVersion!);
        const command = Object.assign(actBy("a", { kind: "attack", fighter: attacker.id, target: target.id }), { recordedRolls: [100] });
        const { outcome } = await play(game, command);
        const events = (outcome as IRealmArenaOutcome).events;
        // The live outcome keeps it for the sender, who may see the roll...
        expect(events).toContainEqual(expect.objectContaining({ kind: "struck", roll: 100, missed: true }));
        // ...and a review's step, for anyone, leaves it out.
        for (const viewer of ["a", "b", null]) {
            const told = stepOutcomeToModel(outcome, viewer, game.specificGameState)?.events ?? [];
            const struck = told.filter(event => event.kind === "struck");
            expect(struck).toHaveLength(1);
            expect(struck[0]).not.toHaveProperty("roll");
            expect(struck[0]).toMatchObject({ chance: 80, missed: true });
        }
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

describe("far shots, cover counts double (§13.3)", () => {
    // A target behind low cover (half) on a long field, and one behind a wall (full) on a tall one.
    const HALF = fieldOf([".".repeat(24), ".".repeat(24).replace(/^(.{13})./, "$1,"), ".".repeat(24)]);
    const FULL = buildBattlefield({
        name: "Wall", rows: Array.from({ length: 16 }, (_, row) => Array.from({ length: 20 }, (_, col) => row === 2 && col === 9 ? "#" : ".").join("")), deployments: [], objectives: {},
    });
    const odds = (field: Battlefield, shooter: CharacterId, from: number, to: number, extra: Partial<Fighter> = {}, kind?: "attack" | "aimedShot" | "overwatch" | "cripplingShot", state = balanced) => {
        const attacker = fighter(1, "a", shooter, from);
        const target = fighter(2, "b", "knight", to, extra);
        return shotOdds(state(field, [attacker, target]), attacker, target, kind);
    };
    const row = (col: number) => at(HALF, col, 1);
    const target = row(14);

    it("is further than 10 squares, measured as the range is, and exactly 10 is not", () => {
        expect(FAR_SHOT_DISTANCE).toBe(10);
        // Half cover, 80% bow: 80 − 20 up close, 80 − 40 from further than 10.
        expect(odds(HALF, "archer", row(5), target)).toMatchObject({ chance: 60, cover: "half", farCover: false });
        expect(odds(HALF, "archer", row(4), target)).toMatchObject({ chance: 60, cover: "half", farCover: false });
        expect(odds(HALF, "archer", row(3), target)).toMatchObject({ chance: 40, cover: "half", farCover: true });
        expect(odds(HALF, "archer", row(0), target)).toMatchObject({ chance: 40, farCover: true });
    });

    it("doubles full cover too: 40 becomes 80", () => {
        const behind = at(FULL, 10, 2);
        // From the far corner, an aimed shot (+20): 100 − 80 against 100 − 40 from a nearer square the wall still covers.
        const far = odds(FULL, "archer", at(FULL, 2, 10), behind, {}, "aimedShot");
        const near = odds(FULL, "archer", at(FULL, 3, 9), behind, {}, "aimedShot");
        expect(near).toMatchObject({ cover: "full", chance: 60, farCover: false });
        expect(far).toMatchObject({ cover: "full", chance: 20, farCover: true });
    });

    it("changes nothing for a target in the open, at any distance", () => {
        const open = odds(HALF, "archer", row(0), at(HALF, 18, 2));
        expect(open).toMatchObject({ cover: "none", flanked: true, chance: 80, farCover: false });
        expect(odds(HALF, "archer", row(20), at(HALF, 3, 0))).toMatchObject({ chance: 80, farCover: false });
    });

    it("doesn't stack with hunkering down: doubled once, never four times", () => {
        const hunkered = { effects: { hunkered: 1 } };
        expect(odds(HALF, "archer", row(5), target, hunkered)).toMatchObject({ chance: 40, farCover: false });
        // From afar it is still ×2, and the far rule added nothing to say.
        expect(odds(HALF, "archer", row(0), target, hunkered)).toMatchObject({ chance: 40, farCover: false });
    });

    it("counts a shield wall's half cover like any other", () => {
        const wall = fighter(3, "b", "knight", row(13), { effects: { shieldWall: 1 } });
        const from = (col: number) => {
            const attacker = fighter(1, "a", "archer", at(OPEN_LONG, col, 1));
            const ally = fighter(2, "b", "mage", at(OPEN_LONG, 14, 1));
            return shotOdds(balanced(OPEN_LONG, [attacker, ally, { ...wall, square: at(OPEN_LONG, 13, 1) }]), attacker, ally);
        };
        expect(from(5)).toMatchObject({ cover: "half", chance: 60, farCover: false });
        expect(from(0)).toMatchObject({ cover: "half", chance: 40, farCover: true });
    });

    it("is every ranged shot's: the Mage Bolt, the acid, an aimed shot, a crippling shot and overwatch", () => {
        // 11+ squares: only an 80%-or-better weapon is still worth a shot behind half cover.
        expect(odds(HALF, "mage", row(2), target)).toMatchObject({ chance: 80 - 40, farCover: true });
        expect(odds(HALF, "spitter", row(2), target)).toMatchObject({ chance: 70 - 40, farCover: true });
        expect(odds(HALF, "spitter", row(1), target)).toBeUndefined();
        expect(odds(HALF, "archer", row(0), target, {}, "aimedShot")?.chance).toBe(80 + 20 - 40);
        expect(odds(HALF, "archer", row(0), target, {}, "cripplingShot")?.chance).toBe(40);
        expect(odds(HALF, "archer", row(0), target, {}, "overwatch")?.chance).toBe(80 - 15 - 40);
        // It moves the graze band with it, like any other penalty.
        expect(odds(HALF, "archer", row(0), target)).toMatchObject({ chance: 40, grazeChance: 10 });
    });

    it("is a shot's, and a battle from before it has none", () => {
        expect(odds(HALF, "archer", row(0), target, {}, "attack", legacy)).toMatchObject({ chance: 60, farCover: false });
        expect(odds(FULL, "archer", at(FULL, 2, 10), at(FULL, 10, 2), {}, "aimedShot", legacy)).toMatchObject({ chance: 60, farCover: false });
    });

    it("reaches the board's list of targets and the planner's odds", () => {
        const from = fighter(1, "a", "archer", row(0));
        const to = fighter(2, "b", "knight", target);
        expect(hitChance(balanced(HALF, [from, to]), from, to)).toBe(40);
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
        expect(abilityRules({ balanced: true }, "heal")).toMatchObject({ cooldown: 0, oncePerTurn: true });
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
        expect(abilityRules({}, "heal")).toEqual({ cooldown: 2 });
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
        expect(abilityRules({}, "raise")).toEqual({ cooldown: 0, oncePerBattle: true });
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
        expect(newFighter(1, "a", "knight", 0, null, undefined, true)).toMatchObject({ hp: 18, maxHp: 18 });
        expect(musterHp("knight", true)).toBe(18);
        expect(musterHp("knight", false)).toBe(12);
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
        expect(stoutTeam(gs.coop?.mission, gs.rulesVersion)).toBe(true);
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
        for (const [version, rolls] of [[LEGACY, undefined], [meta.commandVersion!, [100]]] as const) {
            const { game, attacker, target } = await knightsBeside(version);
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

describe("the Mage Bolt", () => {
    const mage = fighter(1, "a", "mage", at(ROW, 0, 0));
    const target = (away: number) => fighter(2, "b", "knight", at(ROW, away, 0));

    it("hits 80% of the time out to 12 squares, in the open, in a battle under the rebalance", () => {
        expect(CHARACTERS.mage.weapon).toMatchObject({ name: "Mage Bolt", accuracy: 80, range: 12 });
        expect(weaponOf({ balanced: true }, mage)).toMatchObject({ name: "Mage Bolt", accuracy: 80, range: 12 });
        const state = balanced(ROW, [mage, target(12)]);
        expect(shotOdds(state, mage, target(12))).toMatchObject({ chance: 80, farCover: false });
        expect(shotOdds(balanced(ROW, [mage, target(13)]), mage, target(13))).toBeUndefined();
        expect(weaponReaches(state, mage, at(ROW, 12, 0))).toBe(true);
        expect(weaponReaches(state, mage, at(ROW, 13, 0))).toBe(false);
        expect(rangeSquares(state, mage, "weapon").has(at(ROW, 12, 0))).toBe(true);
        expect(check({ ...state, fighters: [mage, target(12)] }, "a", { kind: "attack", fighter: 1, target: 2 })).toEqual({ ap: 2 });
    });

    it("was a Bolt at 70% to a range of 10 in a battle from before it, and its option never changed", () => {
        expect(weaponOf({}, mage)).toMatchObject({ name: "Bolt", kind: "ranged", damage: 3, accuracy: 70, range: 10 });
        expect(shotOdds(legacy(ROW, [mage, target(10)]), mage, target(10))?.chance).toBe(70);
        expect(shotOdds(legacy(ROW, [mage, target(11)]), mage, target(11))).toBeUndefined();
        expect(weaponReaches(legacy(ROW, [mage]), mage, at(ROW, 11, 0))).toBe(false);
        const frost = { ...mage, option: "frostBolt" as const };
        for (const state of [{}, { balanced: true as const }]) expect(weaponOf(state, frost)).toMatchObject({ name: "Frost bolt", accuracy: 70, range: 10 });
        // Nobody else's weapon is gated.
        const archer = fighter(3, "a", "archer", at(ROW, 0, 0));
        expect(weaponOf({}, archer)).toBe(CHARACTERS.archer.weapon);
    });

    it("is on the stats sheet as the current rules say", () => {
        const row = characterStats("mage").actions.find(one => one.name === "Mage Bolt");
        expect(row).toMatchObject({ hit: "80%", range: "12", damage: "3" });
        expect(characterStats("mage").actions.some(one => one.name === "Bolt")).toBe(false);
    });
});

describe("the team's armour against the Realm and the Miners in Hold Out", () => {
    const team = fighter(1, "a", "archer", at(OPEN, 1, 1));
    const knight = fighter(2, warbandOwner(0), "knight", at(OPEN, 2, 1));
    const armoured = (fighters: Fighter[], against: FactionId = "realm"): BattleState => ({ ...balanced(OPEN, fighters), armoured: against, sides: { a: "team", [warbandOwner(0)]: "enemy" } });

    it("is Hold Out's only, against the Realm's and the Miners' only, under the rebalance's rules only", () => {
        expect(ARMOUR).toBe(1);
        expect(armouredTeam("holdOut", 7, "realm")).toBe("realm");
        expect(armouredTeam("holdOut", 7, "miners")).toBe("miners");
        expect(armouredTeam("holdOut", 7, "swarm")).toBeUndefined();
        expect(armouredTeam(undefined, 7, "realm")).toBeUndefined();
        expect(armouredTeam("holdOut", LEGACY, "realm")).toBeUndefined();
        expect(armouredTeam("holdOut", undefined, "realm")).toBeUndefined();
        // A view that doesn't know the enemy yet (a random one unseen) wears none, so the board can't name it.
        expect(armouredTeam("holdOut", 7, undefined)).toBeUndefined();
        // The battle takes the answer from whoever builds it, and only in co-op.
        const built = (extra: object) => battleFrom(OPEN, { fighters: [], coop: true, rulesVersion: 7, armoured: armouredTeam("holdOut", 7, "realm"), ...extra });
        expect(built({}).armoured).toBe("realm");
        expect(viewOf({ ...built({}), fog: true }, "a").armoured).toBe("realm");
        for (const extra of [{ armoured: armouredTeam("holdOut", 7, "swarm") }, { armoured: armouredTeam("holdOut", 7, undefined) }, { coop: false }]) expect(built(extra), JSON.stringify(extra)).not.toHaveProperty("armoured");
    });

    it("is worn by a Miner of the team against the Miners, but not against the Realm, which it's tough enough for (§33.1)", () => {
        const miner = fighter(1, "a", "miner", at(OPEN, 1, 1));
        const realmKnight = fighter(2, warbandOwner(0), "knight", at(OPEN, 2, 1));
        const enemyMiner = fighter(3, warbandOwner(0), "miner", at(OPEN, 2, 1));
        expect(armourOf(armoured([team, miner]), team)).toBe(ARMOUR);
        expect(armourOf(armoured([team, miner]), miner)).toBe(0);
        expect(armourOf(armoured([team, miner], "miners"), miner)).toBe(ARMOUR);
        expect(armourOf(armoured([team, miner], "miners"), team)).toBe(ARMOUR);
        expect(armourOf(armoured([realmKnight]), realmKnight)).toBe(0);
        expect(damageTo(armoured([miner, realmKnight]), realmKnight, miner)).toBe(CHARACTERS.knight.weapon.damage);
        expect(damageTo(armoured([miner, enemyMiner], "miners"), enemyMiner, miner)).toBe(CHARACTERS.miner.weapon.damage - ARMOUR);
    });

    it("takes 1 off a warband's hit on the team, never below 1, and nothing off anyone else's", () => {
        const state = armoured([team, knight]);
        expect([4, 3, 1, 0].map(damage => damageTo(state, knight, team, damage))).toEqual([3, 2, 1, 0]);
        expect(damageTo(state, team, knight, 4)).toBe(4);
        expect(damageTo(state, knight, fighter(3, warbandOwner(1), "archer", 0), 4)).toBe(4);
        expect(damageTo(state, team, fighter(3, "b", "archer", 0), 4)).toBe(4);
        expect(damageTo(balanced(OPEN, []), knight, team, 4)).toBe(4);
    });

    it("applies to a strike, a shot, its graze, a guard, and a blast's splash", () => {
        const state = armoured([knight, team]);
        const strike = run({ ...state }, warbandOwner(0), { kind: "attack", fighter: 2, target: 1 }, [1]);
        expect(strike.events[0]).toMatchObject({ kind: "struck", damage: 3 });
        expect(strike.byId(1).hp).toBe(CHARACTERS.archer.hp - 3);

        const bow = fighter(3, warbandOwner(0), "archer", at(OPEN, 5, 1));
        const knightTeam = fighter(4, "a", "knight", at(OPEN, 1, 1));
        const odds = shotOdds(armoured([bow, knightTeam]), bow, knightTeam)!;
        // Flanked, so 3 + 1 = 4 before armour, and a graze of half that.
        expect(odds).toMatchObject({ flanked: true, damage: 3, grazeDamage: 1 });
        expect(shotOdds(balanced(OPEN, [bow, knightTeam]), bow, knightTeam)).toMatchObject({ damage: 4, grazeDamage: 2 });
        expect(run(armoured([bow, knightTeam]), warbandOwner(0), { kind: "attack", fighter: 3, target: 4 }, [1]).byId(4).hp).toBe(CHARACTERS.knight.hp - 3);

        // A guard's preview of a move says so.
        const guard = fighter(5, warbandOwner(0), "knight", at(OPEN, 3, 1), { ap: 0, banked: 4 });
        const mover = fighter(6, "a", "scout", at(OPEN, 0, 1));
        expect(reactionPreviews(armoured([guard, mover]), mover, [at(OPEN, 0, 1), at(OPEN, 1, 1), at(OPEN, 2, 1)])).toMatchObject([{ kind: "guard", damage: 3 }]);

        // A fireball from a warband's Mage: 3 becomes 2 on the team, and stays 3 on its own side.
        const caster = fighter(7, warbandOwner(0), "mage", at(OPEN, 8, 1));
        const own = fighter(8, warbandOwner(0), "knight", at(OPEN, 4, 2));
        const hit = fighter(9, "a", "knight", at(OPEN, 4, 1));
        const ball = run(armoured([caster, own, hit]), warbandOwner(0), { kind: "fireball", fighter: 7, at: at(OPEN, 4, 1) });
        expect(ball.byId(9).hp).toBe(CHARACTERS.knight.hp - ABILITIES.fireball.damage + ARMOUR);
        expect(ball.byId(8).hp).toBe(CHARACTERS.knight.hp - ABILITIES.fireball.damage);
    });

    it("leaves the team's own friendly fire, and burning, as they were", () => {
        const caster = fighter(1, "a", "mage", at(OPEN, 8, 1));
        const friend = fighter(2, "a", "knight", at(OPEN, 4, 1));
        const ball = run(armoured([caster, friend, knight]), "a", { kind: "fireball", fighter: 1, at: at(OPEN, 4, 1) });
        expect(ball.byId(2).hp).toBe(CHARACTERS.knight.hp - ABILITIES.fireball.damage);
        // A fire a warband lit burns for its full 1 on the team.
        const lit = { ...friend, effects: { burning: 2 }, burnedBy: knight.id };
        const burned = startTurn(armoured([lit, knight]), "a");
        expect(burned.fighters.find(one => one.id === 2)!.hp).toBe(CHARACTERS.knight.hp - 1);
    });

    it("is none at all against the Swarm, in Hold the Centre, or in a battle from before it", () => {
        const plain = balanced(OPEN, [knight, team]);
        expect(run(plain, warbandOwner(0), { kind: "attack", fighter: 2, target: 1 }, [1]).byId(1).hp).toBe(CHARACTERS.archer.hp - 4);
        expect(run(legacy(OPEN, [knight, team]), warbandOwner(0), { kind: "attack", fighter: 2, target: 1 }).byId(1).hp).toBe(CHARACTERS.archer.hp - 4);
    });

    it("reaches a team that hasn't yet seen a random enemy only with the faction beside it", async () => {
        const game = makeGame(["a", "b"], {}, { fog: true, coop: { enemy: "realm", random: true, mission: "holdOut" } });
        await musterAll(game);
        const gs = game.specificGameState;
        expect(gs.coop?.enemySeen).toBeUndefined();
        for (const viewer of ["a", "b", null]) expect(gameStateToModel(gs, viewer, null)).not.toHaveProperty("enemy");

        // An unseen Realm warband lands a blow on a team character; everyone else is down but a teammate far off.
        const { field } = battleOf(game);
        const victim = gs.fighters.find(one => one.owner === "a")!;
        const striker = gs.fighters.find(one => one.owner === warbandOwner(0) && one.character === "manAtArms")!;
        const far = gs.fighters.find(one => one.owner === "b")!;
        const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => (Math.floor(victim.square / field.width) + dr) * field.width + (victim.square % field.width) + dc)
            .find(square => field.tiles[square]?.terrain.standable && field.tiles[square].elevation === field.tiles[victim.square].elevation && !gs.fighters.some(one => one.square === square))!;
        gs.fighters = gs.fighters.map(one => one.id === striker.id ? { ...one, square: beside } : one.id === victim.id || one.id === far.id ? one : { ...one, hp: 0 });

        const end = Object.assign(endTurnBy(game.currentTurn), { recordedEnemyActions: [{ kind: "attack", fighter: striker.id, target: victim.id }], recordedRolls: [1] });
        const { outcome } = await play(game, end);
        expect(outcome.validMove).toBe(true);
        // The blow was armoured: 4 became 3.
        expect((outcome as IRealmArenaOutcome).events).toContainEqual(expect.objectContaining({ kind: "struck", fighter: striker.id, target: victim.id, damage: CHARACTERS.manAtArms.weapon.damage - ARMOUR }));
        expect(gs.fighters.find(one => one.id === victim.id)!.hp).toBe(teamHp(victim.character) - (CHARACTERS.manAtArms.weapon.damage - ARMOUR));
        expect(gs.coop?.enemySeen).toBe(true);
        // Whoever is told the reduced damage — in the response or the review — is told whom they fight in the same breath.
        for (const viewer of ["a", "b", null]) {
            expect(gameStateToModel(gs, viewer, null).enemy, `${viewer}`).toBe("realm");
            const told = stepOutcomeToModel(outcome, viewer, gs)?.events ?? [];
            if (viewer !== null) expect(told).toContainEqual(expect.objectContaining({ kind: "struck", damage: CHARACTERS.manAtArms.weapon.damage - ARMOUR }));
        }
    });

    it("is played in a whole Hold Out against the Realm, from the settings, and not against the Swarm", async () => {
        const realm = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut" } });
        const swarm = makeGame(["a", "b"], {}, { coop: { enemy: "swarm", mission: "holdOut" } });
        const centre = makeGame(["a", "b"], {}, { coop: { enemy: "realm" } });
        const old = makeGame(["a", "b"], {}, { rulesVersion: LEGACY, coop: { enemy: "realm", mission: "holdOut" } });
        const miners = makeGame(["a", "b"], {}, { coop: { enemy: "miners", mission: "holdOut" } });
        expect([realm, miners, swarm, centre, old].map(game => battleOf(game).armoured)).toEqual(["realm", "miners", undefined, undefined, undefined]);
        // A random enemy plays armoured when it's the Realm, though the board is not told until it's seen.
        const drawn = makeGame(["a", "b"], {}, { fog: true, coop: { enemy: "realm", random: true, mission: "holdOut" } });
        expect(battleOf(drawn).armoured).toBe("realm");
        expect(gameStateToModel(drawn.specificGameState, "a", null)).not.toHaveProperty("enemy");
        expect(JSON.stringify(gameStateToModel(drawn.specificGameState, "a", null))).not.toMatch(/armour/i);
    });
});

describe("Hold Out for two lasts 13 rounds", () => {
    const hold = { mission: "holdOut", rulesVersion: 7 };

    it("is only two players' Hold Out under the rebalance: not Solo, a duel, Hold the Centre, or a battle from before it", () => {
        expect(HOLD_OUT_PAIR_ROUNDS).toBe(13);
        expect(battleRounds(2, hold)).toBe(13);
        expect(battleRounds(2, { mission: "holdOut", rulesVersion: LEGACY })).toBe(15);
        expect(battleRounds(2, { mission: "holdOut" })).toBe(15);
        expect(battleRounds(1, hold)).toBe(15);
        expect(battleRounds(2)).toBe(15);
        expect(battleRounds(2, { rulesVersion: 7 })).toBe(15);
        expect(battleRounds(3, hold)).toBe(13);
        expect(battleRounds(3)).toBe(13);
        expect(battleRounds(4)).toBe(12);
    });

    it("is what a game reads, whoever asks: its response, its ending, its waves", async () => {
        const length = (players: string[], settings: RealmArenaSettings) => battleRoundsOf(makeGame(players, {}, settings).specificGameState);
        const holdOut = { coop: { enemy: "realm" as const, mission: "holdOut" as const } };
        expect(length(["a", "b"], holdOut)).toBe(13);
        expect(length(["a", "b"], { ...holdOut, rulesVersion: LEGACY })).toBe(15);
        expect(length(["a"], holdOut)).toBe(15);
        expect(length(["a", "b", "c"], holdOut)).toBe(13);
        expect(length(["a", "b"], { coop: { enemy: "realm" } })).toBe(15);
        expect(length(["a", "b"], {})).toBe(15);

        const game = makeGame(["a", "b"], {}, holdOut);
        await musterAll(game);
        const gs = game.specificGameState;
        expect(gameStateToModel(gs, "a", null).battleRounds).toBe(13);
        expect(gameStateToModel(makeGame(["a", "b"], {}, { ...holdOut, rulesVersion: LEGACY }).specificGameState, "a", null).battleRounds).toBe(15);
        // The waves land at 4, 7, 10 and 13, and the last of them is the last round.
        const rounds = battleRoundsOf(gs);
        expect(Array.from({ length: rounds }, (_, k) => k + 1).filter(round => waveArrives(round, rounds))).toEqual([4, 7, 10, 13]);
        expect(lastWaveRound(rounds)).toBe(13);
        // Over once 13 rounds are played, and not before.
        gs.roundsPlayed = 12;
        expect(new RealmArenaGameType().CheckGameOver(game)).toBe(false);
        gs.roundsPlayed = 13;
        expect(new RealmArenaGameType().CheckGameOver(game)).toBe(true);
        expect(game).toMatchObject({ endReason: "teamwin", endDetail: "held out for all 13 rounds" });
        // The same battle from before the rebalance has two rounds more to play.
        const old = makeGame(["a", "b"], {}, { ...holdOut, rulesVersion: LEGACY });
        await musterAll(old);
        old.specificGameState.roundsPlayed = 13;
        expect(new RealmArenaGameType().CheckGameOver(old)).toBe(false);
        old.specificGameState.roundsPlayed = 15;
        expect(new RealmArenaGameType().CheckGameOver(old)).toBe(true);
        expect(nextWaveOf(old.specificGameState)).toBeUndefined();
        // And a plain duel still ends at 15.
        const duel = makeGame(["a", "b"], {});
        await musterAll(duel);
        const state = battleOf(duel);
        expect([14, 15].map(played => isBattleOver(state, ["a", "b"], played))).toEqual([false, true]);
    });

    it("lands the last wave at round 13 in a whole battle, with nothing after it", async () => {
        const game = makeGame(["a", "b"], {}, { coop: { enemy: "realm", mission: "holdOut" } });
        await musterAll(game);
        const gs = game.specificGameState;
        gs.fighters.forEach(one => { if (one.owner.startsWith("ai:")) one.hp = 0; });
        gs.roundsPlayed = 11;
        await play(game, endTurnBy("a"));
        await play(game, endTurnBy("b"));
        // Round 12 played, round 13's wave landed.
        expect(gs.roundsPlayed).toBe(12);
        expect(game.gameState.history.some(entry => entry.text.includes("fresh wave"))).toBe(true);
        expect(game.complete).toBe(false);
    });
});
