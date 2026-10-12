import { describe, expect, it } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { coverAgainst } from "@/utils/games/battlefield/cover";
import { reachFrom } from "@/utils/games/battlefield/pathfinding";
import { battlefieldWith, buildBattlefield, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";
import { FACTIONS, type CharacterId } from "./characters";
import { FOUR_GATE_FORT } from "./maps/fourGateFort";
import {
    ACTION_POINTS, act, areaAround, blastedIn, check, endTurn, newFighter, reactionsTo, readyMadeMuster, startTurn, viewOf,
    type Action, type BattleState, type Fighter,
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

function fieldOf(rows: string[], centre?: { col: number; row: number; width: number; height: number }): Battlefield {
    return buildBattlefield({ name: "Puzzle", rows, deployments: [], objectives: centre ? { centre } : {} });
}

const battle = (field: Battlefield, fighters: Fighter[], fog = false): BattleState => ({ field, fighters, sides: SIDES, ...(fog ? { fog: true } : {}) });

/** What the warband does next in `state`, from its side's view, in battle round `round`: never something `check` refuses. */
function planned(state: BattleState, round = 1): Action | undefined {
    const action = nextAction(viewOf(state, AI), AI, round);
    if (action) expect(check(state, AI, action)).not.toHaveProperty("refused");
    return action;
}

const OPEN = fieldOf(Array(9).fill(".".repeat(16)));

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
        const end = action && "path" in action ? action.path.at(-1)! : archer.square;
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
        expect(walk[action && "path" in action ? action.path.at(-1)! : knight.square]).toBeLessThan(walk[knight.square]);
    });

    it("stops when it has nothing to do it with: no AP left, or nobody standing", () => {
        const archer = ready(0, AI, "archer", at(OPEN, 0, 0), { ap: 0 });
        const enemy = ready(1, "a", "knight", at(OPEN, 15, 8));
        expect(planned(battle(OPEN, [archer, enemy]))).toBeUndefined();
        expect(planned(battle(OPEN, [{ ...archer, hp: 0, ap: ACTION_POINTS }, enemy]))).toBeUndefined();
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
