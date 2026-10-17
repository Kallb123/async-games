import { describe, expect, it } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { coverAgainst } from "@/utils/games/battlefield/cover";
import { reachFrom } from "@/utils/games/battlefield/pathfinding";
import { battlefieldWith, buildBattlefield, distance, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";
import { FACTIONS, type CharacterId } from "./characters";
import { FOUR_GATE_FORT } from "./maps/fourGateFort";
import {
    ACTION_POINTS, act, areaAround, ATTACK_AP, blastedIn, check, endTurn, inMeleeReach, newFighter, reachOf, reactionsTo, readyMadeMuster, shotOdds, startTurn, viewOf,
    type Action, type BattleState, type Fighter, type FogGhost,
} from "./rules";
import { nextAction, turnMemo } from "./ai";

// docs/games/realm-arena.md §29.7, §29.11: the computer's planner. Each puzzle
// is a small battle with one right answer, set up for the warband "ai:0" to
// move in; "a" and "b" are the team. Nothing here runs a command: the planner
// is pure, and taking what it picks is the turn loop's (PR 4a).

const AI = "ai:0";
const SIDES = { a: "team", b: "team", [AI]: "enemy" };

function ready(id: number, owner: string, character: CharacterId, square: Square, extra: Partial<Fighter> = {}): Fighter {
    return { ...newFighter(id, owner, character, square), ap: ACTION_POINTS, ...extra };
}

type Area = { col: number; row: number; width: number; height: number };

function fieldOf(rows: string[], centre?: Area, deployments: Area[] = []): Battlefield {
    return buildBattlefield({ name: "Puzzle", rows, deployments, objectives: centre ? { centre } : {} });
}

const battle = (field: Battlefield, fighters: Fighter[], fog = false): BattleState => ({ field, fighters, sides: SIDES, ...(fog ? { fog: true } : {}) });

/**
 * What the warband does next in `state`, from its side's view, in battle round
 * `round` — hunting, as in Hold Out, given `hunt`: never something `check` refuses.
 */
function planned(state: BattleState, round = 1, hunt?: readonly FogGhost[]): Action | undefined {
    const action = nextAction(viewOf(state, AI), AI, round, hunt);
    if (action) expect(check(state, AI, action)).not.toHaveProperty("refused");
    return action;
}

/** Where an action leaves a character standing on `from`: the end of its path, if it moves. */
const endOf = (action: Action | undefined, from: Square): Square => action && "path" in action ? action.path.at(-1)! : from;

const OPEN = fieldOf(Array(9).fill(".".repeat(16)));

/**
 * An enemy Archer cut to 2 HP behind a low wall, and a fresh one in the open.
 * Hit or graze, the shot at the wounded one downs it, 70% of the time; the
 * fresh one takes two hits to down and shoots back at full strength until then.
 */
const KNOCK_OUT = (() => {
    const field = fieldOf([
        "................",
        "................",
        "...........o....",
        "................",
        "................",
        "................",
        "................",
    ]);
    const archer = ready(0, AI, "archer", at(field, 0, 3), { ap: ATTACK_AP });
    const wounded = ready(1, "a", "archer", at(field, 12, 2), { hp: 2 });
    const fresh = ready(2, "b", "archer", at(field, 12, 5));
    return { state: battle(field, [archer, wounded, fresh]), archer, wounded, fresh };
})();

describe("nextAction's puzzles (§29.11)", () => {
    it("shoots the flanked enemy rather than the one in cover", () => {
        // A low wall in column 4 covers whoever crouches behind it from the west.
        const field = fieldOf(["....o.....", "..........", "..........", "..........", ".........."]);
        const archer = ready(0, AI, "archer", at(field, 0, 0));
        const covered = ready(1, "a", "knight", at(field, 5, 0));
        const flanked = ready(2, "a", "knight", at(field, 5, 4));
        expect(planned(battle(field, [archer, covered, flanked]))).toMatchObject({ fighter: 0, target: flanked.id });
    });

    it("finishes a wounded enemy rather than spreading the damage", () => {
        const archer = ready(0, AI, "archer", at(OPEN, 0, 4));
        const fresh = ready(1, "a", "manAtArms", at(OPEN, 12, 2));
        const wounded = ready(2, "b", "manAtArms", at(OPEN, 12, 6), { hp: 3 });
        expect(planned(battle(OPEN, [archer, fresh, wounded]))).toMatchObject({ fighter: 0, target: wounded.id });
    });

    it("heals a hurt ally", () => {
        const knight = ready(0, AI, "knight", at(OPEN, 2, 4), { hp: 4 });
        const cleric = ready(1, AI, "cleric", at(OPEN, 6, 4));
        const far = ready(2, "a", "manAtArms", at(OPEN, 15, 0));
        expect(planned(battle(OPEN, [knight, cleric, far]))).toEqual({ kind: "heal", fighter: cleric.id, target: knight.id });
    });

    it("bursts a Bloater among two enemies, its own downing and all (§31.2)", () => {
        const bloater = ready(0, AI, "bloater", at(OPEN, 6, 4));
        const knight = ready(1, "a", "manAtArms", at(OPEN, 7, 4), { hp: 3 });
        const archer = ready(2, "b", "archer", at(OPEN, 5, 4), { hp: 3 });
        expect(planned(battle(OPEN, [bloater, knight, archer]))).toEqual({ kind: "burst", fighter: bloater.id });
    });

    it("throws a Sapper's dynamite among three enemies (§33.2)", () => {
        const sapper = ready(0, AI, "sapper", at(OPEN, 2, 4));
        const enemies = [at(OPEN, 8, 3), at(OPEN, 8, 4), at(OPEN, 8, 5)].map((square, i) => ready(i + 1, "a", "manAtArms", square, { hp: 4 }));
        expect(planned(battle(OPEN, [sapper, ...enemies]))).toMatchObject({ kind: "dynamite", fighter: sapper.id });
    });

    it("tears into an enemy beside a Ravager with Rend, and mends a hurt ally with Regrowth (§31.2)", () => {
        const ravager = ready(0, AI, "ravager", at(OPEN, 6, 4));
        const enemy = ready(1, "a", "archer", at(OPEN, 7, 4));
        expect(planned(battle(OPEN, [ravager, enemy]))).toEqual({ kind: "rend", fighter: ravager.id, target: enemy.id });
        const hurt = ready(0, AI, "ravager", at(OPEN, 2, 4), { hp: 3 });
        const mother = ready(1, AI, "broodmother", at(OPEN, 6, 4));
        const far = ready(2, "a", "manAtArms", at(OPEN, 15, 0));
        expect(planned(battle(OPEN, [hurt, mother, far]))).toEqual({ kind: "regrowth", fighter: mother.id, target: hurt.id });
    });

    it("moves into cover rather than stopping in the open", () => {
        // Too little AP left to shoot back, under the eye of an enemy Archer: the low wall is the only shelter.
        const field = fieldOf([
            "................",
            "................",
            "................",
            "...o............",
            "................",
            "................",
        ]);
        const archer = ready(0, AI, "archer", at(field, 1, 1), { ap: 1 });
        const enemy = ready(1, "a", "archer", at(field, 3, 5));
        const action = planned(battle(field, [archer, enemy]));
        expect(action).toMatchObject({ kind: "move", fighter: 0 });
        const end = endOf(action, archer.square);
        expect(coverAgainst(field, end, enemy.square)).not.toBe("none");
    });

    it("goes round an overwatch lane when a covered way exists", () => {
        // The Archer on watch sees down the east side through the gap at the top
        // of the wall; the low stub of wall hides the centre and the way round
        // the bottom from it. The way through the gap is the shorter.
        const field = fieldOf([
            "..........",
            "..#.......",
            "..#.......",
            "..#.......",
            "..#.######",
            "..#.......",
            "..#.......",
            "..#.......",
            "..........",
        ], { col: 8, row: 5, width: 2, height: 2 });
        const mover = ready(0, AI, "manAtArms", at(field, 0, 1));
        const watcher = ready(1, "a", "archer", at(field, 6, 1), { ap: 0, banked: 4 });
        const state = battle(field, [mover, watcher]);
        const action = planned(state, 2);
        expect(action).toMatchObject({ kind: "move", fighter: 0 });
        const path = action && "path" in action ? action.path : [];
        expect(reactionsTo(state, mover, path)).toEqual([]);
        expect(field.objectives.centre).toContain(path.at(-1));
    });

    it("doesn't fireball its own when another target will do", () => {
        const mage = ready(0, AI, "mage", at(OPEN, 2, 4));
        const mate = ready(1, AI, "archer", at(OPEN, 10, 4), { ap: 0 });
        const crowd = [ready(2, "a", "manAtArms", at(OPEN, 11, 4)), ready(3, "a", "manAtArms", at(OPEN, 10, 5))];
        const alone = ready(4, "b", "knight", at(OPEN, 10, 0));
        // Without its own Archer among them, the crowd is worth the fireball.
        expect(planned(battle(OPEN, [mage, ...crowd, alone]))).toMatchObject({ kind: "fireball", fighter: mage.id });
        const action = planned(battle(OPEN, [mage, mate, ...crowd, alone]));
        expect(action).toMatchObject({ fighter: mage.id });
        if (action?.kind === "fireball") expect(areaAround(OPEN, action.at)).not.toContain(mate.square);
    });

    it("heads for the centre before it scores", () => {
        const field = fieldOf(Array(12).fill(".".repeat(12)), { col: 9, row: 9, width: 2, height: 2 });
        const knight = ready(0, AI, "knight", at(field, 0, 0));
        const action = planned(battle(field, [knight]), 1);
        expect(action).toMatchObject({ kind: "move", fighter: 0 });
        const walk = reachFrom(field, at(field, 9, 9)).costs;
        expect(walk[endOf(action, knight.square)]).toBeLessThan(walk[knight.square]);
    });

    it("stops when it has nothing to do it with: no AP left, or nobody standing", () => {
        const archer = ready(0, AI, "archer", at(OPEN, 0, 0), { ap: 0 });
        const enemy = ready(1, "a", "knight", at(OPEN, 15, 8));
        expect(planned(battle(OPEN, [archer, enemy]))).toBeUndefined();
        expect(planned(battle(OPEN, [{ ...archer, hp: 0, ap: ACTION_POINTS }, enemy]))).toBeUndefined();
    });
});

describe("nextAction in Hold Out (§30.3)", () => {
    it("takes the likely knock-out over wounding a fresh enemy", () => {
        // A team character counts partly by its standing at all: the 70% shot
        // that downs the wounded Archer beats the 80% one that only wounds the
        // fresh one, which would shoot back as hard as ever.
        const { state, archer, wounded } = KNOCK_OUT;
        expect(planned(state, 4, [])).toMatchObject({ fighter: archer.id, target: wounded.id });
    });

    it("closes in on a Knight it outnumbers rather than ringing it just out of reach", () => {
        // Each Skitterling alone would lose the trade with the Knight, but its
        // losses come back with the next wave and the Knight's never do.
        const knight = ready(0, "a", "knight", at(OPEN, 8, 4));
        const pack = [at(OPEN, 6, 4), at(OPEN, 10, 4), at(OPEN, 8, 2), at(OPEN, 8, 6)].map((square, i) => ready(i + 1, AI, "skitterling", square));
        const state = battle(OPEN, [knight, ...pack]);
        const action = planned(state, 4, []);
        expect(action).toMatchObject({ kind: "move" });
        expect(distance(OPEN, endOf(action, knight.square), knight.square)).toBeLessThan(2);
    });

    it("goes looking where the team deployed when it neither sees nor remembers anyone, rather than waiting in the keep", () => {
        // The team's zones (seats a and b) far to the east, out of sight; the warband's in the west.
        const teamZone = { col: 29, row: 0, width: 3, height: 5 };
        const field = fieldOf(Array(5).fill(".".repeat(32)), { col: 1, row: 1, width: 2, height: 2 }, [teamZone, teamZone, { col: 0, row: 0, width: 1, height: 5 }]);
        const knight = ready(0, AI, "knight", at(field, 1, 2));
        const hidden = ready(1, "a", "archer", at(field, 30, 2));
        const state = battle(field, [knight, hidden], true);
        expect(viewOf(state, AI).fighters).toHaveLength(1);
        const action = planned(state, 4, []);
        expect(action).toMatchObject({ kind: "move", fighter: knight.id });
        const walk = reachFrom(field, at(field, 30, 2)).costs;
        expect(walk[endOf(action, knight.square)]).toBeLessThan(walk[knight.square]);
    });
});

describe("nextAction's open puzzles (§29.11)", () => {
    // Puzzles with one right answer that the planner doesn't find yet: the
    // benchmark for improving its score. Each `it.fails` passes while the
    // planner gets it wrong and fails the day it gets it right — then it
    // becomes an ordinary puzzle above. An `it.fails` passes on any error, so
    // an ordinary test beside each holds its premise: a puzzle broken some
    // other way can't hide in it.

    /** Whether `fighter` could walk somewhere with `ap` and still strike `square`: by default, with a fresh turn's AP. */
    const canWalkUpAndStrike = (state: BattleState, fighter: Fighter, square: Square, ap = ACTION_POINTS - ATTACK_AP): boolean => {
        const reach = reachOf(state, { ...fighter, ap });
        return reach.costs.some((cost, from) => cost < Infinity && inMeleeReach(state.field, from, square));
    };

    describe("takes the likely knock-out over wounding a fresh enemy, in Hold the Centre", () => {
        // Solved in Hold Out, where a team character counts partly by its
        // standing at all; in Hold the Centre a hurt enemy still counts as a
        // fraction of one, so the fresh one's 80% at 4 flanked damage outscores
        // the wounded one: about 11.3 points' worth to 7.5, grazes and the
        // knock-out's points counted.
        const { state, archer, wounded, fresh } = KNOCK_OUT;

        it("(its premise)", () => {
            const atWounded = shotOdds(state, archer, wounded)!;
            const atFresh = shotOdds(state, archer, fresh)!;
            expect(atWounded.grazeDamage).toBeGreaterThanOrEqual(wounded.hp);
            expect(atWounded.chance + atWounded.grazeChance).toBe(70);
            expect(atFresh.damage).toBeLessThan(fresh.hp);
        });
        it.fails("shoots the wounded one", () => {
            expect(planned(state)).toMatchObject({ fighter: archer.id, target: wounded.id });
        });
    });

    describe("steps out of a crossfire", () => {
        // Four enemy Archers flank a Man-at-arms that can only move: three to
        // the east, one to the west. Behind the northern wall only the western
        // one flanks it, behind the southern one only the eastern three, and
        // in the open all four. Exposure counts the worst single shot (§29.7),
        // which is a flanked one from somebody wherever it stands, so it sees
        // nothing to gain and stays where all four can shoot it.
        const field = fieldOf([
            "............o...........",
            "............o...........",
            "............o...........",
            "........................",
            "........................",
            "........................",
            "..........o.............",
            "..........o.............",
            "..........o.............",
        ]);
        const mover = ready(0, AI, "manAtArms", at(field, 11, 4), { ap: 1 });
        const archers = [at(field, 23, 2), at(field, 23, 4), at(field, 23, 6), at(field, 0, 4)].map((square, i) => ready(i + 1, "a", "archer", square, { ap: 0 }));
        const state = battle(field, [mover, ...archers]);
        const flankers = (square: Square) => archers.filter(archer => coverAgainst(field, square, archer.square) === "none").length;

        it("(its premise)", () => {
            expect(flankers(mover.square)).toBe(4);
            expect(flankers(at(field, 11, 1))).toBe(1);
            expect(flankers(at(field, 11, 7))).toBe(3);
            // Nobody it could reach to strike, so its Threat is nothing anywhere.
            expect(archers.some(archer => canWalkUpAndStrike(state, mover, archer.square, mover.ap))).toBe(false);
        });
        it.fails("to where one Archer flanks it rather than four", () => {
            expect(flankers(endOf(planned(state), mover.square))).toBeLessThanOrEqual(1);
        });
    });

    describe("steps out of a Knight's reach", () => {
        // A Scout with only a move left, two squares from an enemy Knight. Its
        // Exposure reads the Knight from where it stands (§29.7), and a sword
        // two squares away can't strike, so the Scout counts itself safe and
        // stays, for the Knight to walk up to and strike next turn. Eight
        // squares west, it would be out of the Knight's walk.
        const field = fieldOf(Array(9).fill(".".repeat(24)));
        const scout = ready(0, AI, "scout", at(field, 12, 4), { ap: 1 });
        const knight = ready(1, "a", "knight", at(field, 14, 4));
        const state = battle(field, [scout, knight]);

        it("(its premise)", () => {
            expect(canWalkUpAndStrike(state, knight, scout.square)).toBe(true);
            expect(canWalkUpAndStrike(state, knight, at(field, 4, 4))).toBe(false);
            expect(reachOf(state, scout).costs[at(field, 4, 4)]).toBeLessThan(Infinity);
        });
        it.fails("to where the Knight can't walk up and strike it", () => {
            expect(canWalkUpAndStrike(state, knight, endOf(planned(state), scout.square))).toBe(false);
        });
    });
});

describe("nextAction never cheats (§29.11)", () => {
    // Fog of war: a wall down the middle, and the warband's Knight on the west.
    const field = fieldOf([
        "................",
        ".......#........",
        ".......#........",
        ".......#........",
        ".......#........",
        ".......#........",
        "................",
    ], { col: 12, row: 2, width: 2, height: 2 });
    const knight = ready(0, AI, "knight", at(field, 2, 3));
    const archer = ready(1, AI, "archer", at(field, 1, 1));
    const seen = ready(2, "a", "manAtArms", at(field, 5, 6));

    it("chooses the same, wherever an enemy it can't see stands", () => {
        const hidden = (square: Square) => ready(3, "b", "archer", square, { banked: 4 });
        const choices = new Set<string>();
        let tried = 0;
        for (let square = 0; square < field.tiles.length; square++) {
            if (!field.tiles[square].terrain.standable || [knight, archer, seen].some(one => one.square === square)) continue;
            const state = battle(field, [knight, archer, seen, hidden(square)], true);
            if (viewOf(state, AI).fighters.some(one => one.id === 3)) continue;
            tried++;
            choices.add(JSON.stringify(planned(state, 2)));
        }
        expect(tried).toBeGreaterThan(20);
        expect(choices.size).toBe(1);
    });
});

describe("nextAction's pace (§29.7)", () => {
    // The Swarm's warband is six characters to the Realm's four (§31.1), the Miners' three (§33.1).
    it.each(["realm", "swarm", "miners"] as const)("plans a %s warband's turn on the Four-Gate Fort in under 250 ms", faction => {
        // Three of the team's ready-made squads and one warband. The team ends
        // each of its turns where it stands, so every one of its characters is
        // on watch and every move the warband weighs has a way round to find:
        // as long as a turn gets. Rolls are as good as fixed.
        const team = ["a", "b", "c"];
        const owners = [...team, AI];
        let id = 0;
        const fighters = owners.flatMap((owner, seat) => readyMadeMuster(FOUR_GATE_FORT, seat, FACTIONS[owner === AI ? faction : "realm"].readyMade[80])
            .map(pick => newFighter(id++, owner, pick.character, pick.square)));
        let state: BattleState = { field: FOUR_GATE_FORT, fighters, sides: { a: "team", b: "team", c: "team", [AI]: "enemy" } };
        const turn = (owner: string, round: number) => {
            state = { ...state, fighters: startTurn(state, owner).fighters };
            const start = performance.now();
            if (owner === AI) {
                // As the turn loop plans it: one memo for the whole turn.
                const memo = turnMemo();
                const plan = () => nextAction(viewOf(state, AI), AI, round, undefined, memo);
                for (let action = plan(); action; action = plan()) {
                    state = { ...state, fighters: act(state, AI, action, () => 50).fighters };
                }
            }
            state = { ...state, fighters: endTurn(state, owner, round).fighters };
            return performance.now() - start;
        };
        const times: number[] = [];
        for (let round = 1; round <= 6; round++) {
            for (const player of team) turn(player, round);
            times.push(turn(AI, round));
        }
        // On average, with room for a slow turn on a busy test runner.
        expect(times.reduce((total, ms) => total + ms, 0) / times.length).toBeLessThan(250);
        expect(Math.max(...times)).toBeLessThan(500);
    });
});

describe("a turn's memo (§29.7)", () => {
    // What the memo keeps is good only while nothing it was worked out from
    // has changed. Here warbands' whole turns are planned with one, and each
    // action checked against a plan made without it, through moves, hits,
    // overwatch, blasts and knock-outs, on either mission. The two sides start in
    // reach of each other, among walls and low cover, so it comes to blows.
    const field = fieldOf([
        "....................",
        "...,....#....,......",
        "........#...........",
        "..,.........##...,..",
        "....................",
        "......,.......,.....",
        "..##........#.......",
        "...........,........",
    ]);
    it.each([
        ["realm", "Hold the Centre"], ["swarm", "Hold the Centre"], ["realm", "Hold Out"], ["swarm", "Hold Out"],
    ] as const)("never changes what a %s warband chooses, in %s", (faction, mission) => {
        const team: [string, CharacterId[]][] = [["a", ["knight", "archer", "cleric"]], ["b", ["manAtArms", "mage", "scout"]]];
        const warband = FACTIONS[faction].readyMade[80];
        const fighters = [
            ...team.flatMap(([owner, squad], row) => squad.map((character, i) => ready(row * 3 + i, owner, character, at(field, 2 + 2 * i, 3 * row + 1)))),
            ...warband.map((character, i) => ready(6 + i, AI, character, at(field, 17 - 2 * (i % 3), 1 + 3 * Math.floor(i / 3)))),
        ];
        let state = battle(field, fighters);
        const hunt = mission === "Hold Out" ? [] : undefined;
        let roll = 0;
        const seen = new Set<string>();
        // Some cover blasted already, so every plan is handed a new copy of the map.
        const blasted: Square[] = [at(field, 3, 1), at(field, 2, 3)];
        state = { ...state, field: battlefieldWith(field, blasted) };
        for (let round = 1; round <= 4; round++) {
            for (const owner of ["a", "b", AI]) {
                state = { ...state, fighters: startTurn(state, owner).fighters };
                const memo = turnMemo();
                for (let step = 0; owner === AI && step < 24; step++) {
                    const action = nextAction(viewOf(state, AI), AI, round, hunt, memo);
                    expect(action).toEqual(nextAction(viewOf(state, AI), AI, round, hunt));
                    if (!action) break;
                    // Rolls that hit, graze and miss in turn.
                    const outcome = act(state, AI, action, () => [10, 75, 95][roll++ % 3]);
                    outcome.events.forEach(event => seen.add(event.kind));
                    // What's blasted is cleared from the ground, as the turn loop's battle does (§22).
                    blasted.push(...blastedIn(outcome.events));
                    state = { ...state, field: battlefieldWith(field, blasted), fighters: outcome.fighters };
                }
                state = { ...state, fighters: endTurn(state, owner, round).fighters };
            }
        }
        expect(seen.has("shot") || seen.has("struck")).toBe(true);
        expect(seen).toContain("downed");
    }, 60_000);
});
