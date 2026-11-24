// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { at } from "@/utils/games/battlefield/testFixtures";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import RealmArenaBoard from "./components/RealmArenaBoard";
import { ART_SHEETS, CHARACTER_ART, figureSprites, SPRITES, STRUCTURE_ART, structureArt } from "./art";
import { newFighter, warbandOwner, type Fighter } from "./rules";
import { structureQuad } from "./three/marks3d";

// docs/games/realm-arena.md §39.7: a nest is a structure, so it has no row of the
// characters' sheet to be drawn from. It is one sprite a pose, on a sheet of its own.

const field = buildBattlefield({ name: "Open", rows: ["..........", "..........", "..........", ".........."], deployments: [], objectives: {} });
const CONTEXT = { rulesVersion: 12 };

// The nest (§39.7) and the team's shrine (rules version 13) are drawn the same way: one sprite a pose, on a sheet each.
describe.each(["nest", "shrine"] as const)("the %s's art", structure => {
    const art = STRUCTURE_ART[structure]!;

    it("is a sprite a pose, a character's cell each, on a sheet of its own the board defines", () => {
        expect(Object.keys(art)).toEqual(["standing", "fallen"]);
        expect(art.standing).not.toEqual(art.fallen);
        for (const sprite of Object.values(art)) {
            expect(sprite.sheet).toBe(structure);
            expect(SPRITES.has(sprite)).toBe(true);
            expect(sprite.x + sprite.width).toBeLessThanOrEqual(ART_SHEETS[structure].width);
            expect(sprite.y + sprite.height).toBeLessThanOrEqual(ART_SHEETS[structure].height);
        }
    });

    it("is what a structure is drawn with, and no figure's row is", () => {
        expect(structure in CHARACTER_ART).toBe(false);
        expect(structureArt(structure, "standing")).toBe(art.standing);
        expect(structureArt(structure, "fallen")).toBe(art.fallen);
        expect(structureArt("knight", "standing")).toBeUndefined();
        // Whichever way a board is turned, and with no owner's colour laid over it.
        for (const cell of [0, 3, 7]) expect(figureSprites(structure, "standing", cell)).toEqual({ body: art.standing, team: null });
        expect(figureSprites("knight", "standing", 3)).toEqual({ body: CHARACTER_ART.knight.standing.body[3], team: CHARACTER_ART.knight.standing.team[3] });
    });

    it("stands on a square's middle on the 3D board as it does on the isometric one: as wide as a square, its foot on the square's front corner", () => {
        const { x, y, width, height } = structureQuad(art.standing);
        expect(width).toBe(20);
        expect(x).toBe(0);
        // The quad hangs from the square's middle, which is half a diamond below the isometric group's origin.
        expect(y + height / 2).toBe(10 - 5);
    });
});

describe("a shrine on the isometric board", () => {
    it("draws standing and destroyed from its own art, with no figure's row", () => {
        const draw = (hp: number) => renderToStaticMarkup(React.createElement(RealmArenaBoard, {
            field, fighters: [{ ...newFighter(0, warbandOwner(0), "shrine", at(field, 4, 1), null, undefined, undefined, false, { rulesVersion: 13 }), hp, maxHp: 10 }],
            owners: ["a", "b", warbandOwner(0)], rulesVersion: 13, viewerId: "a",
            colourFor: () => "red", nameFor: () => "The team", selected: undefined, onSelect: () => {},
        }));
        expect(draw(10)).toContain("/art/realmarena/shrine.png");
        expect(draw(0)).toContain("ag-ra-figure--down");
    });
});

describe("a nest on the isometric board", () => {
    const nest = (hp: number): Fighter => ({ ...newFighter(0, warbandOwner(0), "nest", at(field, 4, 1), null, undefined, undefined, false, CONTEXT), hp, maxHp: 10 });

    const draw = (fighters: Fighter[], nestSquares?: number[]) => renderToStaticMarkup(React.createElement(RealmArenaBoard, {
        field, fighters, owners: ["a", "b", warbandOwner(0)], rulesVersion: 12, viewerId: "a", nestSquares,
        colourFor: () => "red", nameFor: () => "The enemy", selected: undefined, onSelect: () => {},
    }));

    it("draws standing and destroyed without a figure's art, and marks its square from the start", () => {
        const standing = draw([nest(10)], [at(field, 4, 1)]);
        expect(standing).toContain("ag-ra-deployment--nest");
        expect(standing).toContain("Nest · The enemy");
        expect(standing).toContain("10/10 HP");
        const downed = draw([nest(0)], [at(field, 4, 1)]);
        expect(downed).toContain("ag-ra-figure--down");
        // Nothing marked where none is told of.
        expect(draw([])).not.toContain("ag-ra-deployment--nest");
    });
});
