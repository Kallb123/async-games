import { describe, expect, it, vi } from "vitest";
import { at, fieldOf, hillOf } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { FACTION_IDS, FACTIONS, factionOf, readyMadeSquad, type CharacterId } from "./characters";
import { RealmArenaMuster, RealmArenaUndo, toldTo } from "./RealmArenaLogic";
import { gameStateToModel } from "./RealmArenaModels";
import { RUINED_FORT } from "./maps/ruinedFort";
import { ACTION_AIMS, rangeKindOf, rangeSquares } from "./tactics";
import { rulesetFor } from "./rulesets";
import { armourOf, act, areaAround, brood, check, damageTo, fixedRolls, hatchSquares, knockoutPoints, musterRefusal, newFighter, startTurn, viewOf, type Action, type BattleEvent, type BattleState, type Fighter } from "./rules";
import { actBy, battleOf as gameBattle, cmd, makeGame, musterAll, play, responseFor } from "./testFixtures";

vi.mock("./masteryRecord", () => ({ masterySnapshotOf: vi.fn(async () => ({})) }));
vi.mock("@/utils/users/clerk", () => ({ userIdListToNamesAndMap: async (ids: string[]) => ({ usernameList: ids, userIdNameMap: Object.fromEntries(ids.map(id => [id, id])) }) }));

// docs/games/realm-arena.md §39.5: the Swarm's three elites, in rules version
// 12 — the computer's alone. "a" is the Swarm's owner here, "b" and "c" the
// enemy it fights, in a free-for-all unless a test sets `sides`.

const V12 = { rulesVersion: 12 };
const field = fieldOf(...Array(8).fill("............"));
const point = (col: number, row = 3) => at(field, col, row);

function fighter(id: number, owner: string, character: CharacterId, col: number, row = 3, extra: Partial<Fighter> = {}, on = field): Fighter {
    return { ...newFighter(id, owner, character, at(on, col, row), null, undefined, false, V12), ap: 6, ...extra };
}
const battleOf = (fighters: Fighter[], extra: Partial<BattleState> = {}, on = field): BattleState => ({ field: on, fighters, ...V12, ...extra });
const get = (state: Pick<BattleState, "fighters">, id: number) => state.fighters.find(one => one.id === id)!;
const hatch = (fighter: number): Action => ({ kind: "hatch", fighter });
const hatched = (events: readonly BattleEvent[]) => events.filter((event): event is Extract<BattleEvent, { kind: "hatched" }> => event.kind === "hatched");
const bileEvents = (events: readonly BattleEvent[]) => events.filter((event): event is Extract<BattleEvent, { kind: "fireball" | "iceBall" | "bile" }> => event.kind === "bile");
/** The Skitterlings on the field standing as a Queen's brood. */
const hatchlings = (state: Pick<BattleState, "fighters">) => state.fighters.filter(one => one.hatchedBy !== undefined);

describe("no muster accepts an elite (§39.5)", () => {
    const zone = RUINED_FORT.deployments[0];
    const ELITES = ["broodQueen", "carapaceBrute", "bileLobber"] as const;

    it("refuses each elite from every faction's roster, the Swarm's own included, and leaves the roster without them", () => {
        for (const id of FACTION_IDS) {
            const faction = rulesetFor(12).FACTIONS[id];
            for (const character of ELITES) {
                expect(musterRefusal(RUINED_FORT, 0, [{ character, square: zone[0] }], 500, {}, faction, V12), `${id} ${character}`).toBe("That character isn't in your faction");
            }
        }
        const swarm = rulesetFor(12).FACTIONS.swarm;
        expect(swarm.characters).toEqual(["skitterling", "ravager", "spitter", "bloater", "broodmother"]);
        // Mixed in with a legal squad, an elite still spoils it.
        expect(musterRefusal(RUINED_FORT, 0, [{ character: "skitterling", square: zone[0] }, { character: "broodQueen", square: zone[1] }], 500, {}, swarm, V12)).toBeDefined();
        expect(musterRefusal(RUINED_FORT, 0, [{ character: "skitterling", square: zone[0] }], 500, {}, swarm, V12)).toBeUndefined();
    });

    it("refuses one sent to the muster command, from the Swarm and from the Realm", async () => {
        const game = makeGame(["a", "b"], {}, { ...V12, factions: ["realm", "swarm"] });
        for (const faction of ["swarm", "realm"] as const) {
            const { outcome } = await play(game, cmd(RealmArenaMuster, "a", { faction, picks: [{ character: "broodQueen", square: game.specificGameState.musters?.length ? 0 : zone[0] }] }));
            expect(outcome.validMove, faction).toBe(false);
        }
        expect(game.specificGameState.musters ?? []).toHaveLength(0);
    });

    it("finds an elite's faction, and its ready-made squads never hold one", () => {
        for (const character of ELITES) expect(factionOf(character, V12)).toBe("swarm");
        expect(factionOf("skitterling", V12)).toBe("swarm");
        expect(factionOf("knight", V12)).toBe("realm");
        for (const id of FACTION_IDS) for (const budget of [50, 70, 100, 120]) {
            for (const character of readyMadeSquad(rulesetFor(12).FACTIONS[id], budget)) expect(ELITES as readonly string[]).not.toContain(character);
        }
    });
});

describe("Hatch (§39.5)", () => {
    it("stands a Skitterling of its owner's on the free square next to it nearest an enemy it sees", () => {
        const state = battleOf([fighter(0, "a", "broodQueen", 5), fighter(1, "b", "knight", 10, 3)]);
        const outcome = act(state, "a", hatch(0), fixedRolls([]));
        expect(hatched(outcome.events)).toEqual([{ kind: "hatched", fighter: 0, target: 2, at: point(6, 3) }]);
        const child = get(outcome, 2);
        expect(child).toMatchObject({ owner: "a", character: "skitterling", square: point(6, 3), hp: 4, ap: 0, hatchedBy: 0, item: null });
        expect(child.maxHp).toBeUndefined();
        // Two squares up for the Queen's turn, and Hatch is on its cooldown.
        expect(get(outcome, 0)).toMatchObject({ ap: 4, cooldowns: { hatch: 2 } });
    });

    it("breaks a tie between squares as far from an enemy by the lowest square number", () => {
        // Column 6 is level with the enemy, so (6,3) is nearest; with it held, (6,2) and (6,4) are the same distance.
        const state = battleOf([fighter(0, "a", "broodQueen", 5), fighter(1, "b", "knight", 10, 3), fighter(2, "a", "manAtArms", 6, 3)]);
        expect(hatchSquares(state, get(state, 0)).slice(0, 2)).toEqual([point(6, 2), point(6, 4)]);
        expect(hatched(act(state, "a", hatch(0), fixedRolls([])).events)[0].at).toBe(point(6, 2));
    });

    it("takes the lowest square when no enemy is in sight, in fog or with nobody to fight", () => {
        const lone = battleOf([fighter(0, "a", "broodQueen", 5)]);
        expect(hatched(act(lone, "a", hatch(0), fixedRolls([])).events)[0].at).toBe(point(4, 2));
        const long = fieldOf(...Array(5).fill(".".repeat(60)));
        // Sight 25: the Knight 40 squares away, behind the Queen's own ground, isn't seen, so it doesn't pull the hatchling its way.
        const fogged = battleOf([fighter(0, "a", "broodQueen", 10, 2, {}, long), fighter(1, "b", "knight", 55, 2, {}, long), fighter(2, "b", "knight", 2, 0, {}, long)], { fog: true }, long);
        expect(viewOf(fogged, "a").fighters.map(one => one.id)).toEqual([0, 2]);
        expect(hatchSquares(viewOf(fogged, "a"), get(fogged, 0))[0]).toBe(at(long, 9, 1));
        expect(hatched(act(fogged, "a", hatch(0), fixedRolls([])).events)[0].at).toBe(at(long, 9, 1));
    });

    it("takes the next id, owned and faced as the Queen, worth a Skitterling's points, and costing nothing else", () => {
        const state = battleOf([fighter(0, "a", "broodQueen", 5, 3, { facing: 3 }), fighter(7, "b", "knight", 10, 3, { hp: 1 })]);
        const outcome = act(state, "a", hatch(0), fixedRolls([]));
        const child = get(outcome, 8);
        expect(child.facing).toBe(get(outcome, 0).facing);
        expect(outcome.fighters.map(one => one.id)).toEqual([0, 7, 8]);
        // Downing it scores a Skitterling's points for whoever does.
        const kill = act({ ...state, fighters: outcome.fighters.map(one => one.id === 7 ? { ...one, hp: 4, ap: 6, square: point(7, 3) } : one) }, "b", { kind: "attack", fighter: 7, target: 8 }, fixedRolls([1]));
        expect(kill.events.find(event => event.kind === "scored")).toMatchObject({ player: "b", points: knockoutPoints("skitterling", V12), reason: "knockout" });
        expect(outcome.events.map(event => event.kind)).toEqual(["hatched"]);
    });

    it("can't act this turn, and does from its owner's next", () => {
        const state = battleOf([fighter(0, "a", "broodQueen", 5), fighter(1, "b", "knight", 10, 3)]);
        const outcome = act(state, "a", hatch(0), fixedRolls([]));
        const after = { ...state, fighters: outcome.fighters };
        expect(check(after, "a", { kind: "move", fighter: 2, path: [point(6, 3), point(6, 2)] })).toEqual({ refused: "Not enough AP" });
        expect(get({ fighters: startTurn(after, "a").fighters }, 2).ap).toBeGreaterThan(0);
    });

    it("is capped at three of its own hatchlings standing, and allowed again once one falls", () => {
        const brooded = (extra: Partial<Fighter> = {}) => battleOf([
            fighter(0, "a", "broodQueen", 5), fighter(1, "b", "knight", 10, 3),
            fighter(2, "a", "skitterling", 4, 1, { hatchedBy: 0 }), fighter(3, "a", "skitterling", 4, 5, { hatchedBy: 0 }),
            fighter(4, "a", "skitterling", 7, 5, { hatchedBy: 0, ...extra }),
            // Not hers: a wave's Skitterling, and another Queen's.
            fighter(5, "a", "skitterling", 2, 2), fighter(6, "a", "skitterling", 1, 1, { hatchedBy: 9 }),
        ]);
        const full = brooded();
        expect(brood(full, get(full, 0))).toHaveLength(3);
        expect(check(full, "a", hatch(0))).toEqual({ refused: "Its brood is as large as it can be" });
        expect(() => act(full, "a", hatch(0), fixedRolls([]))).toThrow();
        const lost = brooded({ hp: 0 });
        expect(check(lost, "a", hatch(0))).toEqual({ ap: 2 });
        expect(hatched(act(lost, "a", hatch(0), fixedRolls([])).events)).toHaveLength(1);
        // Only hers count: with two of hers and strangers beside them it still hatches.
        expect(check(brooded({ hp: 0 }), "a", hatch(0))).toEqual({ ap: 2 });
    });

    it("is refused with no free square next to it, and when it can't afford it or it isn't ready", () => {
        // A Queen in the corner, walled in on three sides by rock.
        const corner = buildBattlefield({ name: "Corner", rows: [".##", "###", "###"], deployments: [], objectives: {} });
        const trapped = battleOf([fighter(0, "a", "broodQueen", 0, 0, {}, corner)], {}, corner);
        expect(check(trapped, "a", hatch(0))).toEqual({ refused: "There's no free square next to it" });
        // Or the squares are held: eight allies and enemies round it.
        const held = battleOf([fighter(0, "a", "broodQueen", 5), ...areaAround(field, point(5, 3)).filter(square => square !== point(5, 3))
            .map((square, i) => ({ ...fighter(i + 1, i % 2 ? "a" : "b", "manAtArms", 0), square }))]);
        expect(check(held, "a", hatch(0))).toEqual({ refused: "There's no free square next to it" });
        const free = battleOf([fighter(0, "a", "broodQueen", 5, 3, { ap: 1 })]);
        expect(check(free, "a", hatch(0))).toEqual({ refused: "Not enough AP" });
        expect(check({ ...free, fighters: [{ ...get(free, 0), ap: 6, cooldowns: { hatch: 1 } }] }, "a", hatch(0))).toEqual({ refused: "Hatch isn't ready yet" });
        // Not another character's, and not a character that can't.
        expect(check(battleOf([fighter(0, "a", "broodQueen", 5)]), "b", hatch(0))).toEqual({ refused: "That isn't one of your characters" });
        expect(check(battleOf([fighter(0, "a", "skitterling", 5)]), "a", hatch(0))).toEqual({ refused: "This Skitterling can't use Hatch" });
    });

    it("never steps a hatchling up or down more than a step could climb", () => {
        // Level 3 all round the Queen, but one square: only that one is a landing.
        const hill = hillOf(["...", "...", "..."], ["333", "303", "331"].map(row => row));
        const high = battleOf([fighter(0, "a", "broodQueen", 1, 1, {}, hill)], {}, hill);
        expect(hatchSquares(high, get(high, 0))).toEqual([at(hill, 2, 2)]);
        expect(hatched(act(high, "a", hatch(0), fixedRolls([])).events)[0].at).toBe(at(hill, 2, 2));
        const cliff = hillOf(["...", "...", "..."], ["333", "303", "333"]);
        expect(check(battleOf([fighter(0, "a", "broodQueen", 1, 1, {}, cliff)], {}, cliff), "a", hatch(0))).toEqual({ refused: "There's no free square next to it" });
    });

    it("is judged on the Queen's own view and placed on the truth, so it never refuses over what is hidden", () => {
        const long = fieldOf(...Array(5).fill(".".repeat(60)));
        const state = battleOf([fighter(0, "a", "broodQueen", 10, 2, {}, long), fighter(1, "b", "knight", 55, 2, {}, long)], { fog: true }, long);
        expect(check(state, "a", hatch(0))).toEqual({ ap: 2 });
        const outcome = act(state, "a", hatch(0), fixedRolls([]));
        expect(hatched(outcome.events)).toHaveLength(1);
        expect(outcome.events).not.toContainEqual(expect.objectContaining({ fizzled: true }));
    });

    it("stays when its Queen falls", () => {
        const state = battleOf([fighter(0, "a", "broodQueen", 5), fighter(1, "b", "knight", 10, 3)]);
        const outcome = act(state, "a", hatch(0), fixedRolls([]));
        const knight = get(outcome, 1);
        const felled = act({ ...state, fighters: outcome.fighters.map(one => one.id === 0 ? { ...one, hp: 1 } : one.id === 1 ? { ...knight, square: point(4, 3), ap: 6 } : one) },
            "b", { kind: "attack", fighter: 1, target: 0 }, fixedRolls([1]));
        expect(get(felled, 0).hp).toBe(0);
        expect(get(felled, 2)).toMatchObject({ hp: 4, hatchedBy: 0, character: "skitterling" });
        // Her brood is still counted by the id, which is never reused.
        expect(brood(felled, get(felled, 0))).toHaveLength(1);
    });

    it("is aimed at nothing", () => {
        expect(ACTION_AIMS.hatch).toEqual({ at: "self" });
    });
});

describe("what a viewer is told of a hatch (§39.5, §27.2)", () => {
    const long = fieldOf(...Array(5).fill(".".repeat(60)));
    const state = battleOf([fighter(0, "a", "broodQueen", 10, 2, {}, long), fighter(1, "b", "knight", 20, 2, {}, long), fighter(2, "c", "knight", 58, 4, {}, long)], { fog: true }, long);
    const outcome = act(state, "a", hatch(0), fixedRolls([]));
    const after: BattleState = { ...state, fighters: outcome.fighters };

    it("tells everyone who sees the hatchling stand up where, and nobody who saw nothing of it a word", () => {
        const near = toldTo(outcome.events, after, "b");
        expect(near).toEqual(outcome.events);
        // The Knight on the far edge sees neither the Queen (25) nor the square.
        expect(toldTo(outcome.events, after, "c")).toEqual([]);
        // The Queen's own side is told in full.
        expect(toldTo(outcome.events, after, "a")).toEqual(outcome.events);
    });

    it("sends a viewer who saw only the Queen no more than that she used Hatch: not where, nor what stood", () => {
        // A Knight sees 15 squares: the Queen at 15, but not the square beside her at 16.
        const edge = fieldOf(...Array(3).fill(".".repeat(30)));
        const seen = battleOf([fighter(0, "b", "knight", 0, 1, {}, edge), fighter(1, "ai:0", "broodQueen", 15, 1, {}, edge), { ...fighter(2, "ai:0", "skitterling", 16, 1, {}, edge), hatchedBy: 1 }], { fog: true }, edge);
        const event: BattleEvent = { kind: "hatched", fighter: 1, target: 2, at: at(edge, 16, 1) };
        expect(toldTo([event], seen, "b")).toEqual([{ kind: "ability", fighter: 1, ability: "hatch" }]);
        // Seeing the square, it is told the lot.
        expect(toldTo([event], { ...seen, fighters: seen.fighters.map(one => one.id === 2 ? { ...one, square: at(edge, 14, 1) } : one) }, "b")).toEqual([event]);
        // And the hidden enemy's own kind stays unnamed while it is hidden: told as nothing at all.
        expect(toldTo([event], seen, "b", true)).toEqual([]);
    });

    it("keeps the hatchling off a viewer's response unless it is in sight, and never sends who laid it", () => {
        const game = makeGame(["a", "b"], {}, { ...V12, fog: true });
        game.specificGameState.fighters = [fighter(0, "a", "broodQueen", 3, 3), fighter(1, "b", "knight", 8, 3)];
        game.specificGameState.phase = "battle";
        for (const viewer of ["a", "b", null]) {
            const view = gameStateToModel(game.specificGameState, viewer, null).fighters;
            for (const one of view) expect(one).not.toHaveProperty("hatchedBy");
        }
        const hatchling = { ...fighter(2, "a", "skitterling", 4, 3), hatchedBy: 0 };
        game.specificGameState.fighters.push(hatchling);
        const seen = gameStateToModel(game.specificGameState, "b", null).fighters;
        expect(seen.map(one => one.id)).toContain(2);
        expect(JSON.stringify(seen)).not.toContain("hatchedBy");
        expect(JSON.stringify(gameStateToModel(game.specificGameState, null, null).fighters)).not.toContain("hatchedBy");
    });
});

describe("armour (§39.5)", () => {
    const strike = (blow: number, target: Fighter, by: Fighter = fighter(9, "b", "knight", 0)) => damageTo(V12, by, target, blow);

    it("takes 1 off every blow a Carapace Brute takes, never leaving less than 1", () => {
        const brute = fighter(0, "a", "carapaceBrute", 4);
        expect(armourOf(V12, brute)).toBe(1);
        expect(strike(5, brute)).toBe(4);
        expect(strike(2, brute)).toBe(1);
        expect(strike(1, brute)).toBe(1);
        // And a character without it takes the whole blow.
        expect(strike(5, fighter(1, "a", "broodQueen", 4))).toBe(5);
        expect(armourOf(V12, fighter(1, "a", "bileLobber", 4))).toBe(0);
    });

    it("adds to Braced's, still never under 1", () => {
        const braced = fighter(0, "a", "carapaceBrute", 4, 3, { effects: { braced: 2 } });
        expect(armourOf(V12, braced)).toBe(2);
        expect(strike(5, braced)).toBe(3);
        expect(strike(2, braced)).toBe(1);
    });

    it("reduces a shot, a strike and a blast alike", () => {
        const brute = fighter(0, "a", "carapaceBrute", 6);
        const lost = (outcome: { fighters: Fighter[] }) => brute.hp - get(outcome, 0).hp;
        const knight = fighter(1, "b", "knight", 5);
        const struck = act(battleOf([brute, knight]), "b", { kind: "attack", fighter: 1, target: 0 }, fixedRolls([1]));
        expect(struck.events.find(event => event.kind === "struck")).toMatchObject({ damage: get(struck, 0).hp === brute.hp ? 0 : lost(struck) });
        expect(lost(struck)).toBe(damageTo(V12, knight, brute) );
        expect(damageTo(V12, knight, brute)).toBe(damageTo(V12, knight, fighter(2, "a", "manAtArms", 6)) - 1);
        const archer = fighter(3, "b", "archer", 0);
        const shot = act(battleOf([brute, archer]), "b", { kind: "attack", fighter: 3, target: 0 }, fixedRolls([1]));
        const bare = act(battleOf([{ ...brute, character: "manAtArms" }, archer]), "b", { kind: "attack", fighter: 3, target: 0 }, fixedRolls([1]));
        expect(lost(shot)).toBe(brute.hp - get(bare, 0).hp - 1);
        expect(lost(shot)).toBeGreaterThan(0);
        const blast = act(battleOf([brute, fighter(4, "b", "mage", 0)]), "b", { kind: "fireball", fighter: 4, at: brute.square }, fixedRolls([]));
        expect(lost(blast)).toBe(damageTo(V12, fighter(4, "b", "mage", 0), brute, rulesetFor(12).ABILITIES.fireball!.damage, "ability"));
    });

    it("doesn't reduce burning or poison, which aren't blows", () => {
        const burning = fighter(0, "a", "carapaceBrute", 4, 3, { effects: { burning: 2 }, burnedBy: 1 });
        const poisoned = fighter(2, "a", "carapaceBrute", 6, 3, { effects: { poisoned: 2 }, effectSources: { poisoned: 1 } });
        const state = battleOf([burning, poisoned, fighter(1, "b", "mage", 10)]);
        const { EFFECTS } = rulesetFor(12);
        expect(EFFECTS.burning.damage).toBeGreaterThan(0);
        const started = startTurn(state, "a");
        expect(get(started, 0).hp).toBe(burning.hp - EFFECTS.burning.damage!);
        expect(get(started, 2).hp).toBe(poisoned.hp - EFFECTS.poisoned!.damage!);
        expect(started.events.filter(event => event.kind === "burned")).toHaveLength(2);
    });

    it("shows on the fighter card as the armour it wears, as Hold Out's does", () => {
        const brute = fighter(0, "a", "carapaceBrute", 4);
        expect(armourOf(battleOf([brute]), brute)).toBe(1);
        expect(armourOf(battleOf([brute]), fighter(1, "a", "broodQueen", 4))).toBe(0);
    });
});

describe("Bile (§39.5)", () => {
    const bile = (fighter: number, col: number, row = 3): Action => ({ kind: "bile", fighter, at: point(col, row) });

    it("hits and corrodes every character in the 3×3, friend or foe, for 2, without a roll", () => {
        const lobber = fighter(0, "a", "bileLobber", 2);
        const state = battleOf([lobber, fighter(1, "b", "knight", 8), fighter(2, "a", "manAtArms", 9), fighter(3, "c", "archer", 8, 4), fighter(4, "b", "knight", 11, 3)]);
        // Fixed rolls with none to give: a roll would throw.
        const outcome = act(state, "a", bile(0, 8), fixedRolls([]));
        const [event] = bileEvents(outcome.events);
        expect(event).toEqual({ kind: "bile", fighter: 0, at: point(8, 3), targets: [1, 2, 3], damage: 2 });
        for (const id of [1, 2, 3]) {
            expect(get(outcome, id).hp).toBe(get(state, id).hp - 2);
            expect(get(outcome, id).effects.corroded).toBeGreaterThan(0);
        }
        // Out of the 3×3: untouched.
        expect(get(outcome, 4)).toEqual(get(state, 4));
        expect(get(outcome, 0)).toMatchObject({ ap: 3, cooldowns: { bile: 2 } });
    });

    it("reaches the thrower itself when it stands that close, and goes through armour", () => {
        const state = battleOf([fighter(0, "a", "bileLobber", 3), fighter(1, "b", "carapaceBrute", 4)]);
        const outcome = act(state, "a", bile(0, 4), fixedRolls([]));
        expect(bileEvents(outcome.events)[0].targets).toEqual([0, 1]);
        expect(get(outcome, 0).hp).toBe(get(state, 0).hp - 2);
        // A Brute takes 1 of the 2, and its Corroded still lands.
        expect(get(outcome, 1).hp).toBe(get(state, 1).hp - 1);
        expect(bileEvents(outcome.events)[0].damages).toEqual({ 0: 2, 1: 1 });
        expect(get(outcome, 1).effects.corroded).toBeGreaterThan(0);
    });

    it("reaches 10 squares and no further, and only where it can see", () => {
        const wide = fieldOf(...Array(8).fill(".............."));
        const state = battleOf([fighter(0, "a", "bileLobber", 0, 3, {}, wide)], {}, wide);
        const lobber = get(state, 0);
        expect(check(state, "a", { kind: "bile", fighter: 0, at: at(wide, 10, 3) })).toEqual({ ap: 3 });
        expect(check(state, "a", { kind: "bile", fighter: 0, at: at(wide, 11, 3) })).toEqual({ refused: "Out of range or out of sight" });
        expect(rangeKindOf("bile", V12)).toBe(10);
        const reach = rangeSquares(state, lobber, 10);
        expect(reach.has(at(wide, 10, 3))).toBe(true);
        expect(reach.has(at(wide, 11, 3))).toBe(false);
        // A wall in the way blocks the sight, so the blast.
        const walled = fieldOf("........", "...#....", "........");
        const behind = battleOf([fighter(0, "a", "bileLobber", 0, 1, {}, walled)], {}, walled);
        expect(check(behind, "a", { kind: "bile", fighter: 0, at: at(walled, 7, 1) })).toEqual({ refused: "Out of range or out of sight" });
        expect(check(behind, "a", { kind: "bile", fighter: 0, at: at(walled, 2, 1) })).toEqual({ ap: 3 });
    });

    it("costs 3 AP and waits out its cooldown of 2", () => {
        const state = battleOf([fighter(0, "a", "bileLobber", 2, 3, { ap: 3 })]);
        expect(check(state, "a", bile(0, 6))).toEqual({ ap: 3 });
        expect(check(battleOf([fighter(0, "a", "bileLobber", 2, 3, { ap: 2 })]), "a", bile(0, 6))).toEqual({ refused: "Not enough AP" });
        const after = act(state, "a", bile(0, 6), fixedRolls([]));
        expect(check({ ...state, fighters: [{ ...get(after, 0), ap: 6 }] }, "a", bile(0, 6))).toEqual({ refused: "Bile isn't ready yet" });
        // Another kind of character has none to cast.
        expect(check(battleOf([fighter(0, "a", "mage", 2)]), "a", bile(0, 6))).toEqual({ refused: "This Mage can't use Bile" });
    });

    it("is aimed at a square, listed only where it would land on someone", () => {
        expect(ACTION_AIMS.bile).toEqual({ at: "square", range: 10, useful: "area" });
    });
});

describe("Carapace (§39.5)", () => {
    it("is passive: refused as an action, and costs nothing", () => {
        const state = battleOf([fighter(0, "a", "carapaceBrute", 4)]);
        expect(check(state, "a", { kind: "carapace", fighter: 0 })).toEqual({ refused: "Carapace is passive" });
        expect(ACTION_AIMS.carapace).toEqual({ at: "self" });
    });
});

describe("Hatch and Bile taken as commands (§39.5)", () => {
    // a's first two characters made a Brood Queen and a Bile Lobber: no muster can do it, and the rules don't mind whose they are.
    async function elites() {
        const game = makeGame(["a", "b"], {}, V12);
        await musterAll(game);
        const [queen, lobber] = game.specificGameState.fighters.filter(one => one.owner === "a");
        Object.assign(queen, { character: "broodQueen", hp: 20 });
        Object.assign(lobber, { character: "bileLobber", hp: 12 });
        return { game, queen, lobber };
    }

    it("hatches a Skitterling that takes the next id, tells the log, and can't be undone", async () => {
        const { game, queen } = await elites();
        const before = game.specificGameState.fighters.length;
        const top = Math.max(...game.specificGameState.fighters.map(one => one.id));
        const { outcome } = await play(game, actBy("a", { kind: "hatch", fighter: queen.id }));
        expect(outcome.validMove).toBe(true);
        const fighters = game.specificGameState.fighters;
        expect(fighters).toHaveLength(before + 1);
        expect(fighters.at(-1)).toMatchObject({ id: top + 1, owner: "a", character: "skitterling", hatchedBy: queen.id, ap: 0 });
        expect(game.gameState.history[0].text).toContain("hatched a Skitterling with their Brood Queen");
        // Taking it back would unmake a character, so it never is: the sender has nothing to undo.
        expect((await responseFor(game, "a")).specificGameState.canUndo).toBe(false);
        expect((await play(game, cmd(RealmArenaUndo, "a"))).outcome.validMove).toBe(false);
        expect(fighters).toHaveLength(before + 1);
        // What the Queen did earns mastery as an ability does (a warband's earns none, but a player's tally still counts).
        expect(game.specificGameState.fighters.find(one => one.id === queen.id)?.tally?.abilities).toBe(1);
        // The response never carries who hatched it.
        expect(JSON.stringify(await responseFor(game, "a"))).not.toContain("hatchedBy");
    });

    it("spits bile for the log, tallies it and can't be undone either", async () => {
        const { game, lobber } = await elites();
        const field = gameBattle(game).field;
        const target = field.tiles.findIndex((_, square) => square !== lobber.square && !game.specificGameState.fighters.some(one => one.square === square)
            && check(gameBattle(game), "a", { kind: "bile", fighter: lobber.id, at: square }).hasOwnProperty("ap"));
        expect(target).toBeGreaterThanOrEqual(0);
        const { outcome } = await play(game, actBy("a", { kind: "bile", fighter: lobber.id, at: target }));
        expect(outcome.validMove).toBe(true);
        expect(game.gameState.history[0].text).toContain("spat bile with their Bile Lobber");
        expect((await responseFor(game, "a")).specificGameState.canUndo).toBe(false);
        expect(game.specificGameState.fighters.find(one => one.id === lobber.id)?.tally?.abilities).toBe(1);
    });

    it("refuses both in a battle under the rules of version 11", async () => {
        const game = makeGame(["a", "b"], {}, { rulesVersion: 11 });
        await musterAll(game);
        const mine = game.specificGameState.fighters.find(one => one.owner === "a")!;
        for (const action of [{ kind: "hatch", fighter: mine.id }, { kind: "bile", fighter: mine.id, at: 0 }] as Action[]) {
            expect((await play(game, actBy("a", action))).outcome.validMove).toBe(false);
        }
    });
});
