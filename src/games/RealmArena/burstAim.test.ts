import { describe, expect, it } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { ACTION_POINTS, newFighter, type BattleState, type Fighter } from "./rules";
import { burstPreview, hpPreview, type Draft } from "./useTurnDraft";

// Aiming anything at a Bloater shades where it would burst and who it would catch (§39.3).
const field = buildBattlefield({ name: "Open", rows: ["..........", "..........", "..........", "..........", ".........."], deployments: [], objectives: {} });
const ready = (id: number, owner: string, character: "knight" | "archer" | "bloater", col: number, row: number): Fighter =>
    ({ ...newFighter(id, owner, character, at(field, col, row)), ap: ACTION_POINTS });

const archer = ready(0, "a", "archer", 0, 2);
const friend = ready(1, "a", "knight", 5, 2); // beside the Bloater
const bloater = ready(2, "b", "bloater", 4, 2);
const foe = ready(3, "b", "knight", 4, 3); // beside it too
const far = ready(4, "b", "knight", 9, 4);
const stateAt = (rulesVersion: number): BattleState => ({ field, fighters: [archer, friend, bloater, foe, far], sides: { a: "team", b: "enemy" }, rulesVersion });

const shoot: Draft = { aim: "attack", square: null, targets: [2] };

describe("burstPreview", () => {
    it("at version 12 shades the burst area and catches friend and foe, not the Bloater", () => {
        const battle = stateAt(12);
        const preview = burstPreview(battle, hpPreview(battle, archer, shoot, null));
        expect(preview?.bloaters.map(one => one.id)).toEqual([2]);
        expect(preview?.caught.map(one => one.id)).toEqual([1, 3]);
        expect(preview?.area).toContain(friend.square);
        expect(preview?.area).not.toContain(far.square);
    });

    it("is found when a fireball's area covers the Bloater", () => {
        const battle = stateAt(12);
        const area = [bloater.square];
        const hp = hpPreview(battle, archer, { aim: "fireball", square: bloater.square, targets: [] }, area);
        expect(burstPreview(battle, hp)?.caught.map(one => one.id)).toEqual([1, 3]);
    });

    it("is nothing before version 12, or when the blow isn't aimed at a Bloater", () => {
        const before = stateAt(11);
        expect(burstPreview(before, hpPreview(before, archer, shoot, null))).toBeNull();
        const battle = stateAt(12);
        expect(burstPreview(battle, hpPreview(battle, archer, { aim: "attack", square: null, targets: [3] }, null))).toBeNull();
    });
});
