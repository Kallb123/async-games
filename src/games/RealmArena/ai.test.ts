import { describe, expect, it } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { coverAgainst } from "@/utils/games/battlefield/cover";
import { reachFrom } from "@/utils/games/battlefield/pathfinding";
import { buildBattlefield, type Battlefield, type Square } from "@/utils/games/battlefield/terrain";
import { FACTIONS, type CharacterId } from "./characters";
import { FOUR_GATE_FORT } from "./maps/fourGateFort";
import {
    ACTION_POINTS, act, areaAround, check, endTurn, newFighter, reactionsTo, readyMadeMuster, startTurn, viewOf,
    type Action, type BattleState, type Fighter,
} from "./rules";
import { nextAction } from "./ai";

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
    it("plans a warband's turn on the Four-Gate Fort in under 250 ms", () => {
        // Three of the team's ready-made squads and one warband. The team ends
        // each of its turns where it stands, so every one of its characters is
        // on watch and every move the warband weighs has a way round to find:
        // as long as a turn gets. Rolls are as good as fixed.
        const team = ["a", "b", "c"];
        const owners = [...team, AI];
        let id = 0;
        const fighters = owners.flatMap((owner, seat) => readyMadeMuster(FOUR_GATE_FORT, seat, FACTIONS.realm.readyMade[3])
            .map(pick => newFighter(id++, owner, pick.character, pick.square)));
        let state: BattleState = { field: FOUR_GATE_FORT, fighters, sides: { a: "team", b: "team", c: "team", [AI]: "enemy" } };
        const turn = (owner: string, round: number) => {
            state = { ...state, fighters: startTurn(state, owner).fighters };
            const start = performance.now();
            if (owner === AI) {
                for (let action = nextAction(viewOf(state, AI), AI, round); action; action = nextAction(viewOf(state, AI), AI, round)) {
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
