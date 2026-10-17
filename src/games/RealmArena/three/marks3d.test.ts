import { describe, expect, it } from "vitest";
import { EFFECT_ART, ITEM_ART, WATCH_ART } from "@/games/RealmArena/art";
import type { Fighter } from "@/games/RealmArena/rules";
import { ACTION_POINTS } from "@/games/RealmArena/rules";
import { AP_PIP_OFFSET, AP_PIP_STEP, EFFECT_MARK_OFFSET, EFFECT_MARK_STEP, FIGURE_RISE, ITEM_MARK_OFFSET } from "@/games/RealmArena/ui";
import { ISO_HALF_WIDTH } from "@/utils/ui/isometric";
import { columnAt, figureMarks, marksOf } from "./marks3d";
import { dashCount, ringBox } from "./rings3d";

/** A standing fighter with the given changes: only what the marks read is real. */
const fighter = (change: Partial<Fighter> = {}): Fighter => ({
    id: 1, owner: "a", character: "knight", square: 0, hp: 5, ap: 2, banked: 0, effects: {}, cooldowns: {}, spent: [], item: null, ...change,
} as Fighter);

describe("a column of marks", () => {
    it("is centred on zero, a step apart", () => {
        expect(columnAt(0, 3)).toEqual([]);
        expect(columnAt(1, 3)).toEqual([0]);
        expect(columnAt(3, 3)).toEqual([-3, 0, 3]);
        expect(columnAt(4, 2)).toEqual([-3, -1, 1, 3]);
    });
});

describe("where a figure's marks hang", () => {
    it("puts the watch mark first in the column down the left, centred on the disc", () => {
        const { marks } = figureMarks({ effects: ["burning", "marked"], watching: true });
        expect(marks.map(mark => mark.sprite)).toEqual([WATCH_ART, EFFECT_ART.burning, EFFECT_ART.marked]);
        expect(marks.map(mark => mark.y)).toEqual([-EFFECT_MARK_STEP - FIGURE_RISE, -FIGURE_RISE, EFFECT_MARK_STEP - FIGURE_RISE]);
        expect(new Set(marks.map(mark => mark.x))).toEqual(new Set([-EFFECT_MARK_OFFSET]));
    });

    it("puts the AP pips down the right, lit as many as the AP left", () => {
        const { pips } = figureMarks({ effects: [], watching: false, pips: [true, true, false, false] });
        expect(pips.map(pip => pip.on)).toEqual([true, true, false, false]);
        expect(pips.map(pip => pip.x)).toEqual([AP_PIP_OFFSET, AP_PIP_OFFSET, AP_PIP_OFFSET, AP_PIP_OFFSET]);
        expect(pips[1].y - pips[0].y).toBeCloseTo(AP_PIP_STEP, 9);
        expect(pips[0].y + pips[3].y).toBeCloseTo(-2 * FIGURE_RISE, 9);
    });

    it("puts the item by the right shoulder, above the pips", () => {
        const { item, pips } = figureMarks({ effects: [], watching: false, item: "smokePot", pips: [true, true, true, true] });
        expect(item).toEqual({ sprite: ITEM_ART.smokePot, x: ITEM_MARK_OFFSET.x, y: ITEM_MARK_OFFSET.y - FIGURE_RISE });
        expect(item!.y).toBeLessThan(Math.min(...pips.map(pip => pip.y)));
        expect(figureMarks({ effects: [], watching: false }).item).toBeNull();
    });
});

describe("what a figure wears", () => {
    const worn = fighter({ banked: 2, effects: { burning: 2 }, item: "fireFlask", ap: 3 });

    it("wears everything at rest: the watch, its effects, its item and, on its owner's turn, its AP", () => {
        const all = marksOf("all", worn, true);
        expect(all.watching).toBe(true);
        expect(all.effects).toEqual(["burning"]);
        expect(all.item).toBe("fireFlask");
        expect(all.pips).toHaveLength(ACTION_POINTS);
        expect(all.pips!.filter(Boolean)).toHaveLength(3);
        expect(marksOf("all", worn, false).pips).toEqual([]);
    });

    it("wears only its item while it walks, as the isometric board draws a walker", () => {
        expect(marksOf("item", worn, true)).toEqual({ effects: [], watching: false, item: "fireFlask" });
    });

    it("wears nothing once it's down", () => {
        expect(marksOf("none", worn, true)).toEqual({ effects: [], watching: false });
    });
});

describe("the rings round the feet", () => {
    it("draws a ring in a box that holds its diameter and its stroke, the dashed marker outside the ring", () => {
        expect(ringBox("selected")).toBeGreaterThan(2 * ISO_HALF_WIDTH * 0.62);
        expect(ringBox("aimed")).toBeGreaterThan(ringBox("selected"));
        expect(ringBox("watch")).toBeGreaterThan(ringBox("flagged"));
        expect(ringBox("sealed")).toBe(ringBox("watch"));
    });

    it("spaces the dashes of a ring as the isometric board's ellipse holds them", () => {
        // The marker's ellipse is 8 by 4 board units, a little under 39 round: a dash and a gap of 2 each.
        const count = dashCount(0.8, [1.2, 0.8]);
        expect(count).toBe(19);
        expect(dashCount(0.8, [1.2, 0.8])).toBeGreaterThan(dashCount(0.62, [1.2, 0.8]));
    });
});
