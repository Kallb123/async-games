import { describe, expect, it, vi } from "vitest";
import { buildTimeline } from "@/utils/games/replay";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { at } from "@/utils/games/battlefield/testFixtures";
import { gameStateToModel } from "./RealmArenaModels";
import { afflictionsOf, kitOf, squadPoints, type CharacterId } from "./characters";
import { nextAction } from "./ai";
import { CURRENT_RULESET_VERSION, rulesetFor } from "./rulesets";
import * as rulesets from "./rulesets";
import { act, canAct, bounceTargets, beckonPath, check, damageTo, dodgeReach, endTurn, fixedRolls, leapLanding, newFighter, oddsBreakdown, purified, shotOdds, shovePath, startTurn, temporaryCover, type Action, type BattleState, type Fighter } from "./rules";
import { ACTION_AIMS, rangeSquares, targetsOf } from "./tactics";
import { MOVE, tapFighter, tapSquare, type TapContext } from "./useTurnDraft";
import { actBy, battleOf, makeGame, musterAll, play, playScriptedTurn, cmd } from "./testFixtures";
import { RealmArenaUndo, toldTo, unnamed } from "./RealmArenaLogic";
import { battleCues, oddsLines, LEAP_LIFT, shakesOf, walkFacing, walkLift, type BattleCue } from "./ui";

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

const field = buildBattlefield({ name: "Open", rows: Array(10).fill("................"), deployments: [], objectives: {} });
const point = (col: number, row = 3) => at(field, col, row);
const version = { rulesVersion: 9 };
function fighter(id: number, character: CharacterId, col: number, owner = "a", row = 3, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, point(col, row), null, undefined, false, version), ap: 4, ...extra };
}
const battle = (...fighters: Fighter[]): BattleState => ({ field, fighters, ...version });
function run(state: BattleState, action: Action, rolls: number[] = []) {
    const outcome = act(state, state.fighters.find(one => one.id === action.fighter)!.owner, action, fixedRolls(rolls));
    return { ...state, ...outcome };
}
const get = (state: Pick<BattleState, "fighters">, id: number) => state.fighters.find(one => one.id === id)!;

describe("Realm overhaul catalogue isolation", () => {
    it("plays v9's kits from v9 on, preserving the legacy, v7 and v8 kits", () => {
        expect(CURRENT_RULESET_VERSION).toBeGreaterThanOrEqual(9);
        expect(rulesetFor(10).CHARACTERS).toBe(rulesetFor(9).CHARACTERS);
        for (const rulesVersion of [undefined, 7, 8]) {
            const old = rulesetFor(rulesVersion);
            expect(old.FACTIONS.realm.characters).toContain("scout");
            expect(old.CHARACTERS.manAtArms.abilities).toEqual(["cleave"]);
            expect(old.RULES.MAX_ATTACKS_PER_TURN).toBeNull();
            expect(old.ABILITIES.leap).toBeUndefined();
        }
        expect(rulesetFor(8).ABILITIES.shieldWall.passive).toBe(true);
        expect(rulesetFor(8).ABILITIES.raise.apOnRaise).toBe(2);
        expect(rulesetFor(7).ABILITIES.shieldWall.passive).toBeUndefined();
        const current = rulesetFor(9);
        expect(current.FACTIONS.realm.characters).toEqual(["manAtArms", "knight", "archer", "mage", "cleric"]);
        for (const [budget, squad] of Object.entries(current.FACTIONS.realm.readyMade)) {
            expect(squad).not.toContain("scout");
            expect(squadPoints(squad, version)).toBe(Number(budget));
        }
        expect(kitOf("knight", "demolish", version).abilities).toEqual(["bulwark", "taunt", "demolish"]);
        expect(kitOf("knight", "demolish", { rulesVersion: 7 }).abilities).toEqual(["demolish"]);
    });

    it("preserves the Miners' active shield wall and delayed Raise", () => {
        const stone = fighter(0, "stonewarden", 2), ally = fighter(1, "miner", 3);
        const before = battle(stone, ally);
        expect(temporaryCover(before, ally)).toBe("none");
        expect(temporaryCover(run(before, { kind: "shieldWall", fighter: 0 }), ally)).toBe("half");
        const priest = fighter(2, "runepriest", 6), down = fighter(3, "miner", 7, "a", 3, { hp: 0, ap: 0 });
        expect(get(run(battle(priest, down), { kind: "runeRaise", fighter: 2, target: 3 }), 3).ap).toBe(0);
    });
});

describe("Man-at-arms", () => {
    it("gains bonus AP, attacks twice and still uses Cleave; banks at most four", () => {
        const man = fighter(0, "manAtArms", 4), a = fighter(1, "knight", 5, "b"), b = fighter(2, "knight", 4, "b", 4);
        let state = run(battle(man, a, b), { kind: "slashAndDash", fighter: 0 });
        expect(get(state, 0).ap).toBe(6);
        expect(check(state, "a", { kind: "slashAndDash", fighter: 0 })).toHaveProperty("refused");
        state = run(state, { kind: "attack", fighter: 0, target: 1 }, [1]);
        state = run(state, { kind: "attack", fighter: 0, target: 2 }, [1]);
        expect(check(state, "a", { kind: "attack", fighter: 0, target: 1 })).toEqual({ refused: "At most 2 attacks per turn" });
        state = run(state, { kind: "cleave", fighter: 0, targets: [1, 2] }, [1, 1]);
        expect(get(state, 0).attacksThisTurn).toBe(2);
        expect(get(state, 1).hp).toBe(4);
        const bonus = run(battle(man), { kind: "slashAndDash", fighter: 0 });
        expect(get(run(bonus, { kind: "watch", fighter: 0 }), 0).banked).toBe(4);
        expect(get(endTurn(bonus, "a", 1), 0)).toMatchObject({ ap: 0, banked: 4 });
        expect(get(startTurn(state, "a"), 0).attacksThisTurn).toBeUndefined();
    });

    it("leaps without rolls or reactions, hitting only enemies beside the landing", () => {
        const man = fighter(0, "manAtArms", 1), enemy = fighter(1, "archer", 6, "b", 3, { banked: 4 }), ally = fighter(2, "archer", 5, "a", 4);
        const state = battle(man, enemy, ally), at = point(5);
        const result = run(state, { kind: "leap", fighter: 0, at });
        expect(get(result, 0)).toMatchObject({ square: at, ap: 1 });
        expect(get(result, 1)).toMatchObject({ hp: 4, banked: 4 });
        expect(get(result, 2).hp).toBe(6);
        expect(result.events.some(event => "reaction" in event && event.reaction)).toBe(false);
        expect(leapLanding(state, man, enemy.square)).toBe(false);
        expect(leapLanding(state, man, point(7))).toBe(false);
        expect(rangeSquares(state, man, "leap").has(at)).toBe(true);
    });
});

describe("Knight", () => {
    it("Bulwark covers enemies too and Taunt braces the whole allied side", () => {
        const knight = fighter(0, "knight", 3), enemy = fighter(1, "manAtArms", 4, "b"), ally = fighter(2, "archer", 14, "c");
        const state = { ...battle(knight, enemy, ally), sides: { a: "team", c: "team", b: "enemy" }, armoured: true as const };
        expect(temporaryCover(state, enemy)).toBe("half");
        expect(temporaryCover(state, knight)).toBe("none");
        const result = run(state, { kind: "taunt", fighter: 0 });
        expect(get(result, 0).effects.braced).toBe(1);
        expect(get(result, 2).effects.braced).toBe(1);
        expect(get(result, 1).effects.braced).toBeUndefined();
        expect(damageTo(result, { ...enemy, owner: "ai:0" }, get(result, 0), 4)).toBe(2);
        expect(get(startTurn(result, "a"), 0).effects.braced).toBeUndefined();
    });

    it("pushes without reactions and hurts both characters in a collision; a miss does neither", () => {
        const knight = fighter(0, "knight", 2), enemy = fighter(1, "manAtArms", 3, "b"), blocker = fighter(2, "archer", 5, "a");
        const state = battle(knight, enemy, blocker);
        expect(shovePath(state, knight, enemy).path).toEqual([point(3), point(4)]);
        const hit = run(state, { kind: "shove", fighter: 0, target: 1 }, [1]);
        expect(get(hit, 1)).toMatchObject({ square: point(4), hp: 5 });
        expect(get(hit, 2).hp).toBe(5);
        const miss = run(state, { kind: "shove", fighter: 0, target: 1 }, [100]);
        expect(get(miss, 1)).toMatchObject({ square: point(3), hp: 8 });
        expect(get(miss, 2).hp).toBe(6);
    });
});

describe("Archer", () => {
    const archer = fighter(0, "archer", 1), enemy = fighter(1, "manAtArms", 7, "b");
    it("poisons only on a hit, ticks twice, heals it and credits the poisoner", () => {
        const state = battle(archer, enemy);
        const hit = run(state, { kind: "poisonArrow", fighter: 0, target: 1 }, [1]);
        expect(get(hit, 1)).toMatchObject({ hp: 4, effects: { poisoned: 2 }, effectSources: { poisoned: 0 } });
        const first = { ...hit, ...startTurn(hit, "b") };
        expect(get(first, 1)).toMatchObject({ hp: 3, effects: { poisoned: 1 } });
        expect(get(startTurn(first, "b"), 1)).toMatchObject({ hp: 2, effects: {} });
        const graze = run(state, { kind: "poisonArrow", fighter: 0, target: 1 }, [85]);
        expect(get(graze, 1).effects.poisoned).toBeUndefined();
        const cleric = fighter(2, "cleric", 8, "b");
        expect(get(run({ ...hit, fighters: [...hit.fighters, cleric] }, { kind: "heal", fighter: 2, target: 1 }), 1).effects.poisoned).toBeUndefined();
        const dying = { ...hit, fighters: hit.fighters.map(one => one.id === 1 ? { ...one, hp: 1 } : one) };
        expect(startTurn(dying, "b").events).toContainEqual({ kind: "scored", player: "a", points: 3, reason: "knockout" });
    });

    it("records a separate bounce draw, excludes friends, and does not bounce on a graze", () => {
        const second = fighter(2, "archer", 9, "b"), third = fighter(3, "archer", 10, "b"), friend = fighter(4, "archer", 8);
        const state = battle(archer, enemy, second, third, friend);
        const hit = run(state, { kind: "bouncingArrow", fighter: 0, target: 1 }, [1, 2]);
        expect(get(hit, 2).hp).toBe(6);
        expect(get(hit, 3).hp).toBe(4);
        expect(get(hit, 4).hp).toBe(6);
        expect(run(state, { kind: "bouncingArrow", fighter: 0, target: 1 }, [85]).fighters.slice(2)).toEqual(state.fighters.slice(2));
    });

    it("splits into two chosen, independently rolled shots, even after two weapon attacks", () => {
        const second = fighter(2, "archer", 9, "b");
        const state = battle({ ...archer, attacksThisTurn: 2 }, enemy, second);
        expect(targetsOf(state, "a", get(state, 0), "splittingArrow")).toEqual([1, 2]);
        const result = run(state, { kind: "splittingArrow", fighter: 0, targets: [1, 2] }, [1, 100]);
        expect(get(result, 1).hp).toBe(5); // 2 plus the usual flank bonus
        expect(get(result, 2).hp).toBe(6);
        expect(check(state, "a", { kind: "splittingArrow", fighter: 0, targets: [1, 1] })).toHaveProperty("refused");
    });

    it("dodges after a miss without reactions, including staying still; refuses forged paths", () => {
        const watcher = fighter(2, "archer", 10, "b", 3, { banked: 4 });
        const state = battle(archer, enemy, watcher);
        const action: Action = { kind: "shootDodge", fighter: 0, target: 1, path: [point(1), point(2), point(3), point(4)] };
        const result = run(state, action, [100]);
        expect(get(result, 0)).toMatchObject({ square: point(4), hp: 6, ap: 1 });
        expect(get(result, 2).banked).toBe(4);
        expect(check(state, "a", { ...action, path: [point(1)] })).toEqual({ ap: 3 });
        for (const path of [[], [point(2)], [point(1), point(5)], [point(1), point(2), point(3), point(4), point(5)]]) expect(check(state, "a", { ...action, path })).toHaveProperty("refused");
    });
});

describe("Mage and Cleric", () => {
    it("focus boosts ability hits and grazes before armour, but neither Mage Bolt nor damage ticks", () => {
        const mage = fighter(0, "mage", 1, "a", 3, { effects: { focused: 2, blessed: 2 } }), enemy = fighter(1, "knight", 6, "b", 3, { effects: { braced: 1 } });
        const state = battle(mage, enemy);
        expect(shotOdds(state, mage, enemy, "attack")!.damage).toBe(4);
        expect(shotOdds(state, mage, enemy, "thunder")).toMatchObject({ damage: 4, grazeDamage: 3 });
        const ice = run(state, { kind: "iceBall", fighter: 0, at: enemy.square });
        expect(get(ice, 1)).toMatchObject({ hp: 10, effects: { slowed: 2 } });
        const thunder = run(state, { kind: "thunder", fighter: 0, target: 1 }, [1]);
        expect(get(thunder, 1).effects.stunned).toBe(1);
        expect(get(startTurn(thunder, "b"), 1).ap).toBe(2);
        const focused = run(battle({ ...mage, effects: {} }), { kind: "focus", fighter: 0 });
        const ended = { ...focused, ...endTurn(focused, "a", 1) };
        expect(get(ended, 0).effects.focused).toBe(1);
        expect(get(startTurn(ended, "a"), 0).effects.focused).toBe(1);
    });

    it("blesses teammates only through the end of their next turn and wards against shots only", () => {
        const cleric = fighter(0, "cleric", 4), ally = fighter(1, "manAtArms", 6, "c"), enemy = fighter(2, "archer", 12, "b");
        const state = { ...battle(cleric, ally, enemy), sides: { a: "team", c: "team", b: "enemy" } };
        const blessed = run(state, { kind: "blessing", fighter: 0 });
        expect(get(blessed, 0).effects.blessed).toBe(2);
        expect(get(blessed, 1).effects.blessed).toBe(1);
        expect(get(endTurn(blessed, "c", 1), 1).effects.blessed).toBeUndefined();
        const warded = run(state, { kind: "ward", fighter: 0, target: 1 });
        expect(shotOdds(warded, enemy, get(warded, 1))!.cover).toBe("full");
        expect(damageTo(warded, enemy, get(warded, 1), 4)).toBe(4);
        const next = { ...warded, ...startTurn(warded, "c") };
        expect(get(next, 1).effects.warded).toBe(1);
        expect(get(startTurn(next, "c"), 1).effects.warded).toBeUndefined();
    });

    it("pulls along the cheapest route, stops before another character and raises with immediate AP only for the owner", () => {
        const cleric = fighter(0, "cleric", 2), ally = fighter(1, "manAtArms", 8), blocker = fighter(2, "archer", 5);
        const state = battle(cleric, ally, blocker);
        expect(beckonPath(state, cleric, ally)).toEqual([point(8), point(7), point(6)]);
        expect(get(run(state, { kind: "beckon", fighter: 0, target: 1 }), 1).square).toBe(point(6));
        const down = fighter(3, "manAtArms", 3, "a", 3, { hp: 0, ap: 0 });
        expect(get(run(battle(cleric, down), { kind: "raise", fighter: 0, target: 3 }), 3)).toMatchObject({ hp: 4, ap: 2 });
        const other = { ...battle(cleric, { ...down, owner: "c" }), sides: { a: "team", c: "team" } };
        expect(get(run(other, { kind: "raise", fighter: 0, target: 3 }), 3).ap).toBe(0);
    });
});

it("Shoot + Dodge uses two taps, then confirms a legal destination; splitting keeps two targets", () => {
    const archer = fighter(0, "archer", 1), enemy = fighter(1, "archer", 7, "b"), second = fighter(2, "archer", 9, "b");
    const state = battle(archer, enemy, second);
    const context: TapContext = { battle: state, fighter: archer, draft: { ...MOVE, aim: "shootDodge" }, reach: dodgeReach(state, archer), candidates: [1, 2] };
    const picked = tapFighter(context, 1);
    expect(picked).toEqual({ aim: "shootDodge", targets: [1], square: null });
    context.draft = picked as TapContext["draft"];
    expect(tapSquare(context, point(3))).toEqual({ aim: "shootDodge", targets: [1], square: point(3) });
    expect(tapFighter(context, 0)).toEqual({ aim: "shootDodge", targets: [1], square: archer.square });
    context.draft = { aim: "splittingArrow", targets: [1], square: null };
    expect(tapFighter(context, 2)).toEqual({ aim: "splittingArrow", targets: [1, 2], square: null });
    for (const id of Object.keys(rulesetFor(9).ABILITIES)) expect(ACTION_AIMS).toHaveProperty(id);
});

it("the computer's new actions remain legal and deterministic", () => {
    const state = battle(fighter(0, "manAtArms", 2), fighter(1, "archer", 4, "b"));
    const action = nextAction(state, "a", 1);
    expect(action).toBeDefined();
    expect(action).toEqual(nextAction(state, "a", 1));
    expect(check(state, "a", action)).not.toHaveProperty("refused");
});

it("keeps old games stamped and undoes bonus AP with its cooldown and attack count", async () => {
    const game = makeGame();
    await musterAll(game);
    const gs = game.specificGameState;
    // These squares are open in the battlefield's bottom deployment area.
    const own = gs.fighters.find(one => one.owner === "a")!;
    own.character = "manAtArms";
    const before = structuredClone(gs.fighters);
    expect((await play(game, actBy("a", { kind: "slashAndDash", fighter: own.id }))).outcome.validMove).toBe(true);
    expect(gs.fighters.find(one => one.id === own.id)!.ap).toBe(6);
    expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(true);
    expect(gs.fighters).toEqual(before);
    expect(gs.rulesVersion).toBe(CURRENT_RULESET_VERSION);
    const old = makeGame(undefined, undefined, { rulesVersion: 8 });
    await musterAll(old);
    expect(old.specificGameState.rulesVersion).toBe(8);
    expect(old.specificGameState.fighters.some(one => one.character === "knight")).toBe(true);
});

it("keeps reused mastery options in their selected character catalogue in either lookup order", () => {
    for (const rulesVersion of [7, 9, 8, 9, 7]) {
        const kit = kitOf("manAtArms", "shieldBash", { rulesVersion });
        expect(kit.abilities).toEqual(rulesVersion === 9 ? ["shieldBash", "leap", "slashAndDash"] : ["shieldBash"]);
    }
});

it("scrubs hidden enemy ability names, movement labels and area kinds", () => {
    const blocked = buildBattlefield({ name: "Blind corner", rows: ["...#...", ".......", "......."], deployments: [], objectives: {} });
    const own = { ...fighter(0, "knight", 1), square: 2 };
    const mage = { ...fighter(1, "mage", 1, "ai:0"), square: 4 };
    const before = { field: blocked, fighters: [own, mage], rulesVersion: 9, fog: true };
    const result = run(before, { kind: "iceBall", fighter: 1, at: 9 });
    const told = toldTo(result.events, result, "a", true);
    expect(told).toContainEqual({ kind: "struck", fighter: 1, target: 0, damage: 1, reaction: false });
    expect(JSON.stringify(told)).not.toContain("iceBall");
    expect(unnamed([{ kind: "ability", fighter: 1, ability: "slashAndDash" }, { kind: "moved", fighter: 1, path: [4, 11], sneaking: false, via: "leap" }], () => true))
        .toEqual([{ kind: "moved", fighter: 1, path: [4, 11], sneaking: false }]);
});

it("replays a recorded Bouncing Arrow without drawing fresh randomness", async () => {
    const game = makeGame();
    await musterAll(game);
    for (let turn = 0; turn < 24 && !game.complete; turn++) {
        const state = battleOf(game);
        const archer = state.fighters.find(one => one.owner === game.currentTurn && one.character === "archer" && one.ap >= 3);
        const target = archer && targetsOf(state, game.currentTurn, archer, "bouncingArrow").find(id => bounceTargets(state, archer, get(state, id)).length > 0);
        if (archer && target !== undefined) {
            const command = actBy(game.currentTurn, { kind: "bouncingArrow", fighter: archer.id, target });
            const entropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(array => {
                (array as Uint32Array).fill(0);
                return array;
            });
            try { expect((await play(game, command)).outcome.validMove).toBe(true); }
            finally { entropy.mockRestore(); }
            expect(command.recordedRolls).toEqual([1, 1]);
            const noEntropy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(() => { throw new Error("fresh entropy during replay"); });
            try {
                const timeline = await buildTimeline(game, { a: "Alice", b: "Bob" }, [], undefined, "a");
                expect(timeline.snapshots.at(-1)!.specificGameState).toEqual(gameStateToModel(game.specificGameState, "a", command.id));
            } finally { noEntropy.mockRestore(); }
            return;
        }
        await playScriptedTurn(game);
    }
    throw new Error("No bounce opportunity in the battle");
});

it("offers Slash and Dash at zero AP but cannot reopen a Hunker or Watch", () => {
    const man = fighter(0, "manAtArms", 2, "a", 3, { ap: 0 });
    expect(canAct(man, version)).toBe(true);
    const bonus = run(battle(man), { kind: "slashAndDash", fighter: 0 });
    expect(get(bonus, 0).ap).toBe(2);
    expect(canAct({ ...get(bonus, 0), ap: 0 }, version)).toBe(false);
    for (const kind of ["hunker", "watch"] as const) {
        const ended = run(battle({ ...man, ap: 4 }), { kind, fighter: 0 });
        expect(canAct(get(ended, 0), version)).toBe(false);
        expect(check(ended, "a", { kind: "slashAndDash", fighter: 0 })).toHaveProperty("refused");
    }
});

it("reports focused area damage per target and keeps it private when nobody sees it", () => {
    const mage = fighter(0, "mage", 2, "a", 3, { effects: { focused: 2 } });
    const enemy = fighter(1, "knight", 6, "b", 3, { effects: { braced: 1 } });
    const ally = fighter(2, "archer", 6, "a", 4);
    const result = run(battle(mage, enemy, ally), { kind: "iceBall", fighter: 0, at: enemy.square });
    expect(result.events[0]).toMatchObject({ kind: "iceBall", damages: { 1: 1, 2: 2 } });
    expect(toldTo(result.events, { ...result, fog: true }, null, true)).toEqual([]);
});

it("crosses low cover on a push and stops before high cover", () => {
    const terrain = buildBattlefield({ name: "Push", rows: ["...,...."], deployments: [], objectives: {} });
    const knight = { ...fighter(0, "knight", 1), square: 1 }, enemy = { ...fighter(1, "manAtArms", 2, "b"), square: 2 };
    const state = { field: terrain, fighters: [knight, enemy], rulesVersion: 9 };
    expect(shovePath(state, knight, enemy)).toMatchObject({ path: [2, 3, 4], collision: false });
    const wall = buildBattlefield({ name: "Wall", rows: ["...#...."], deployments: [], objectives: {} });
    expect(shovePath({ ...state, field: wall }, knight, enemy)).toMatchObject({ path: [2], collision: true });
});

describe("the Realm's abilities as the board plays them (§26, §34)", () => {
    const cuesOf = (state: BattleState, action: Action, rolls: number[] = []) => {
        const after = run(state, action, rolls);
        return { after, cues: battleCues(field, after.events, state.fighters, after.fighters, version) };
    };
    const ofKind = <Kind extends BattleCue["kind"]>(cues: readonly BattleCue[], kind: Kind) => cues.filter((cue): cue is Extract<BattleCue, { kind: Kind }> => cue.kind === kind);

    it("leaps in one arc, coming down in dust as everyone beside the landing is hit", () => {
        const man = fighter(0, "manAtArms", 1), enemy = fighter(1, "archer", 6, "b");
        const { cues } = cuesOf(battle(man, enemy), { kind: "leap", fighter: 0, at: point(5) });
        const [walk] = ofKind(cues, "walk");
        expect(walk).toMatchObject({ path: [point(1), point(5)], motion: "leap" });
        const down = walk.start + walk.length;
        expect(ofKind(cues, "burst")).toEqual([expect.objectContaining({ burst: "slam", at: point(5), radius: 1, start: down })]);
        expect(ofKind(cues, "text").find(cue => cue.fighter === 1)).toMatchObject({ start: down, value: "−2", from: point(5) });
        expect(shakesOf(cues)).toEqual([{ start: down, length: expect.any(Number) }]);
        expect(walkLift({ from: point(1), to: point(5), across: 0.5, motion: "leap" }, () => 0)).toBe(-LEAP_LIFT);
    });

    it("pushes its victim back without a step, and a collision lands on both at once", () => {
        const knight = fighter(0, "knight", 2), enemy = fighter(1, "manAtArms", 3, "b"), blocker = fighter(2, "archer", 5, "a");
        const { cues } = cuesOf(battle(knight, enemy, blocker), { kind: "shove", fighter: 0, target: 1 }, [1]);
        expect(ofKind(cues, "slash")).toHaveLength(1);
        const [walk] = ofKind(cues, "walk");
        expect(walk).toMatchObject({ fighter: expect.objectContaining({ id: 1 }), path: [point(3), point(4)], motion: "pushed" });
        const stopped = walk.start + walk.length;
        expect(ofKind(cues, "burst")).toEqual([expect.objectContaining({ burst: "slam", at: point(4), radius: 0, start: stopped })]);
        const collisions = ofKind(cues, "text").filter(cue => cue.value === "−1");
        expect(collisions.map(cue => [cue.fighter, cue.start])).toEqual([[1, stopped], [2, stopped]]);
        const leg = { from: point(3), to: point(4), motion: "pushed" as const };
        expect(walkFacing(field, leg)).toBe(walkFacing(field, { from: point(4), to: point(3) }));
        expect(walkLift({ ...leg, across: 0.5 }, () => 0)).toBeCloseTo(0);
    });

    it("pulls a Beckoned ally along without a step, and darts away after Shoot + Dodge", () => {
        const cleric = fighter(0, "cleric", 1), ally = fighter(1, "knight", 7);
        const [pull] = ofKind(cuesOf(battle(cleric, ally), { kind: "beckon", fighter: 0, target: 1 }).cues, "walk");
        expect(pull).toMatchObject({ motion: "pulled" });
        const archer = fighter(0, "archer", 1), enemy = fighter(1, "knight", 9, "b");
        const { cues } = cuesOf(battle(archer, enemy), { kind: "shootDodge", fighter: 0, target: 1, path: [point(1), point(1, 4)] }, [100]);
        expect(ofKind(cues, "walk")).toEqual([expect.objectContaining({ motion: "dash" })]);
    });

    it("flies a Bouncing Arrow on from its first target, and a Poison Arrow green", () => {
        const archer = fighter(0, "archer", 1), enemy = fighter(1, "knight", 6, "b"), next = fighter(2, "knight", 8, "b");
        const bounce = ofKind(cuesOf(battle(archer, enemy, next), { kind: "bouncingArrow", fighter: 0, target: 1 }, [1, 1]).cues, "flight");
        expect(bounce.map(({ missile, from, to }) => [missile, from, to])).toEqual([["arrow", point(1), point(6)], ["arrow", point(6), point(8)]]);
        const poison = ofKind(cuesOf(battle(archer, enemy), { kind: "poisonArrow", fighter: 0, target: 1 }, [1]).cues, "flight");
        expect(poison.map(cue => cue.missile)).toEqual(["poisonArrow"]);
    });

    it("throws Ice Ball as a shard that bursts in frost, and Thunder as lightning that cracks where it strikes", () => {
        const mage = fighter(0, "mage", 1), enemy = fighter(1, "knight", 6, "b");
        const ice = cuesOf(battle(mage, enemy), { kind: "iceBall", fighter: 0, at: point(6) }).cues;
        expect(ofKind(ice, "flight").map(cue => cue.missile)).toEqual(["iceShard"]);
        expect(ofKind(ice, "burst")).toEqual([expect.objectContaining({ burst: "frost", at: point(6), radius: 1 })]);
        const thunder = cuesOf(battle(mage, enemy), { kind: "thunder", fighter: 0, target: 1 }, [1]).cues;
        const [flight] = ofKind(thunder, "flight");
        expect(flight.missile).toBe("lightning");
        expect(ofKind(thunder, "burst")).toEqual([expect.objectContaining({ burst: "thunder", at: point(6), radius: 0, start: flight.start + flight.land })]);
        expect(ofKind(cuesOf(battle(mage, enemy), { kind: "thunder", fighter: 0, target: 1 }, [100]).cues, "burst")).toEqual([]);
    });

    it("lights everyone a Taunt braces at once, and rings a Ward", () => {
        const knight = fighter(0, "knight", 1), archer = fighter(1, "archer", 9), mage = fighter(2, "mage", 12);
        const glows = ofKind(cuesOf(battle(knight, archer, mage), { kind: "taunt", fighter: 0 }).cues, "burst");
        expect(glows.map(cue => [cue.burst, cue.at])).toEqual([["aura", point(1)], ["aura", point(9)], ["aura", point(12)]]);
        expect(new Set(glows.map(cue => cue.start)).size).toBe(1);
        const cleric = fighter(0, "cleric", 1), near = fighter(1, "archer", 5);
        expect(ofKind(cuesOf(battle(cleric, near), { kind: "ward", fighter: 0, target: 1 }).cues, "burst")).toEqual([expect.objectContaining({ burst: "ward", at: point(5) })]);
        expect(ofKind(cuesOf(battle(fighter(0, "manAtArms", 1)), { kind: "slashAndDash", fighter: 0 }).cues, "burst")).toEqual([expect.objectContaining({ burst: "aura" })]);
    });

    it("names the blow a Leap, a collision or a bounce struck, but not while it would name a hidden enemy's kit", () => {
        const knight = fighter(0, "knight", 2, "ai:0"), enemy = fighter(1, "manAtArms", 3, "a"), blocker = fighter(2, "archer", 5, "ai:0");
        const { after } = cuesOf(battle(knight, enemy, blocker), { kind: "shove", fighter: 0, target: 1 }, [1]);
        expect(after.events.filter(event => event.kind === "struck" && event.via === "shove")).toHaveLength(2);
        const told = unnamed(after.events, id => id !== 1);
        expect(told.some(event => "via" in event && event.via !== undefined)).toBe(false);
    });
});

describe("Purify preserves positive conditions", () => {
    const buffs = { braced: 1, blessed: 2, focused: 2, warded: 2 };
    const cleric = fighter(0, "cleric", 3, "a", 3, { option: "purify" });

    it("does not consider healthy buffed allies in need of Purify", () => {
        const ally = fighter(1, "mage", 4, "a", 3, { effects: buffs });
        const state = battle(cleric, ally);
        expect(afflictionsOf(version)).toContain("poisoned");
        for (const buff of Object.keys(buffs)) expect(afflictionsOf(version)).not.toContain(buff);
        expect(purified(state, cleric)).toEqual([]);
        expect(check(state, "a", { kind: "purify", fighter: 0 })).toHaveProperty("refused");
    });

    it.each([false, true])("heals or clears poison while preserving all buffs (poisoned: %s)", poisoned => {
        const ally = fighter(1, "mage", 4, "a", 3, { hp: poisoned ? 5 : 3, effects: { ...buffs, ...(poisoned ? { poisoned: 2 } : {}) } });
        const result = run(battle(cleric, ally), { kind: "purify", fighter: 0 });
        expect(get(result, 1)).toMatchObject({ hp: 5, effects: buffs });
        expect(get(result, 1).effects.poisoned).toBeUndefined();
    });

    it("uses the selected catalogue's beneficial flag rather than a fixed list of buff names", () => {
        const original = rulesets.rulesetOf;
        const catalogue = original(version);
        const future = { ...catalogue, EFFECTS: { ...catalogue.EFFECTS, marked: { ...catalogue.EFFECTS.marked, beneficial: true as const } } };
        const lookup = vi.spyOn(rulesets, "rulesetOf").mockImplementation(context => context?.rulesVersion === 9 ? future : original(context));
        try {
            for (const rulesVersion of [8, 9]) {
                const ally = fighter(1, "mage", 4, "a", 3, { hp: 3, effects: { marked: 2 } });
                const result = run({ ...battle(cleric, ally), rulesVersion }, { kind: "purify", fighter: 0 });
                expect(get(result, 1).effects.marked).toBe(rulesVersion === 9 ? 2 : undefined);
            }
        } finally {
            lookup.mockRestore();
        }
    });
});

it("names Bulwark separately from the Stonewarden's active Shield wall in the hit breakdown", () => {
    const archer = fighter(0, "archer", 1), target = fighter(1, "archer", 6, "b");
    const coverLine = (guard: Fighter) => oddsLines(oddsBreakdown(battle(archer, target, guard), archer, target), "Bow accuracy", version).find(line => line.amount < 0);
    expect(coverLine(fighter(2, "knight", 7, "b"))?.label).toBe("Bulwark (counts as half cover)");
    expect(coverLine(fighter(2, "stonewarden", 7, "b", 3, { effects: { shieldWall: 1 } }))?.label).toBe("Shield wall (counts as half cover)");
});
