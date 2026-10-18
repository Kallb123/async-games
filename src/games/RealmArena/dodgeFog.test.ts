import { describe, expect, it, vi } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { pathCost } from "@/utils/games/battlefield/pathfinding";
import { act, check, fixedRolls, newFighter, squadSight, type BattleState } from "./rules";

// Short sight makes unseen blockers reachable within the current three-point
// dodge. All movement, AP and reaction rules remain the real v9 values.
vi.mock("./rulesets", async importOriginal => {
    const real = await importOriginal<typeof import("./rulesets")>();
    const v9 = real.rulesetFor(9);
    const shortSight = { ...v9, CHARACTERS: { ...v9.CHARACTERS, archer: { ...v9.CHARACTERS.archer, sight: 1 } } };
    return { ...real, rulesetOf: (context?: { rulesVersion?: number }) => {
        const rules = real.rulesetOf(context);
        return rules === v9 ? shortSight : rules;
    } };
});

const field = buildBattlefield({ name: "Dodge lane", rows: [".....", ".....", "....."], deployments: [], objectives: {} });
const archer = { ...newFighter(0, "a", "archer", 5), ap: 4 };
const shotTarget = newFighter(1, "b", "knight", 0);

function dodge(hiddenAt: number, path: number[]) {
    const hidden = { ...newFighter(2, "b", "knight", hiddenAt), banked: 4 };
    const state: BattleState = { field, fighters: [archer, shotTarget, hidden], rulesVersion: 9, fog: true };
    const action = { kind: "shootDodge" as const, fighter: 0, target: 1, path };
    expect(squadSight(state, "a")(hiddenAt)).toBe(false);
    expect(check(state, "a", action)).toEqual({ ap: 3 });
    const outcome = act(state, "a", action, fixedRolls([100]));
    const moved = outcome.fighters.find(one => one.id === archer.id)!;
    const walked = outcome.events.flatMap(event => event.kind === "moved" ? event.path : []);
    expect(outcome.events).toContainEqual({ kind: "spotted", fighter: 0, by: 2 });
    expect(walked).not.toContain(hiddenAt);
    expect(moved.square).not.toBe(hiddenAt);
    expect(moved.ap).toBe(1);
    expect(outcome.fighters.find(one => one.id === hidden.id)!.banked).toBe(4);
    expect(pathCost(field, walked.length ? walked : [archer.square])).toBeLessThanOrEqual(3);
    expect(new Set(outcome.fighters.filter(one => one.hp > 0).map(one => one.square)).size).toBe(outcome.fighters.length);
    return moved.square;
}

describe("Shoot + Dodge discovering hidden enemies", () => {
    it("stops short of an unseen enemy occupying the destination", () => {
        expect(dodge(7, [5, 6, 7])).not.toBe(7);
    });

    it("routes around a hidden enemy in the path within the dodge budget", () => {
        dodge(7, [5, 6, 7, 8]);
    });
});
