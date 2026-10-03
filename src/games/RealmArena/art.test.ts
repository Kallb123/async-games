import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TERRAIN, type TerrainLetter } from "@/utils/games/battlefield/terrain";
import { EFFECT_IDS, ITEM_IDS } from "./characters";
import { ART_SHEETS, CLIPS, EFFECT_ART, GRASS, ITEM_ART, SMOKE_ART, grassOf, SPRITES, spriteBox, TERRAIN_ART, variantOf } from "./art";

/** A PNG's size, read off its header: the served sheet is the one the sprites are cut from. */
function pngSize(file: string): { width: number; height: number } {
    const png = readFileSync(file);
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("the art sheets", () => {
    it("are served at the size the sprites are measured against, from a master of the same size", () => {
        for (const sheet of Object.values(ART_SHEETS)) {
            const size = { width: sheet.width, height: sheet.height };
            expect(pngSize(path.join("public", sheet.href))).toEqual(size);
            // A drawn sheet's master is the export itself; one rendered from an
            // SVG master (the effects' and the items') declares the same size in it.
            const master = path.join("art-masters", sheet.href.replace(/^\/art\//, ""));
            if (existsSync(master)) expect(pngSize(master)).toEqual(size);
            else expect(readFileSync(master.replace(/\.png$/, ".svg"), "utf8")).toContain(`width="${size.width}" height="${size.height}"`);
        }
    });

    it("hold every sprite whole", () => {
        for (const sprite of SPRITES.keys()) {
            const sheet = ART_SHEETS[sprite.sheet];
            expect(sprite.x + sprite.width).toBeLessThanOrEqual(sheet.width);
            expect(sprite.y + sprite.height).toBeLessThanOrEqual(sheet.height);
        }
    });
});

describe("EFFECT_ART", () => {
    it("gives every effect a cell of its own on the effects sheet", () => {
        const cells = EFFECT_IDS.map(effect => EFFECT_ART[effect]);
        expect(cells.every(cell => cell.sheet === "effects")).toBe(true);
        expect(new Set(cells.map(cell => cell.x)).size).toBe(EFFECT_IDS.length);
        expect(cells.every(cell => SPRITES.has(cell))).toBe(true);
    });
});

describe("ITEM_ART", () => {
    it("gives every item a cell of its own on the items sheet, and the smoke's cloud the next", () => {
        const cells = [...ITEM_IDS.map(item => ITEM_ART[item]), SMOKE_ART];
        expect(cells.every(cell => cell.sheet === "items")).toBe(true);
        expect(new Set(cells.map(cell => cell.x)).size).toBe(ITEM_IDS.length + 1);
        expect(cells.every(cell => SPRITES.has(cell))).toBe(true);
    });
});

describe("TERRAIN_ART", () => {
    it("draws every terrain the rules have, and only open ground with nothing but the grass", () => {
        const letters = Object.keys(TERRAIN) as TerrainLetter[];
        expect(Object.keys(TERRAIN_ART).sort()).toEqual([...letters].sort());
        for (const letter of letters) expect(TERRAIN_ART[letter].length > 0).toBe(letter !== ".");
    });

    it("cuts every layer down within the height the rules give its terrain", () => {
        for (const [letter, layers] of Object.entries(TERRAIN_ART) as [TerrainLetter, typeof TERRAIN_ART[TerrainLetter]][]) {
            for (const layer of layers) {
                expect(layer.at + (layer.clip ?? 0)).toBeLessThanOrEqual(TERRAIN[letter].height);
                // A layer is only cut down from a sprite tall enough to reach.
                if (layer.clip !== undefined) for (const sprite of layer.sprites) expect(sprite.rise).toBeGreaterThanOrEqual(layer.clip);
            }
        }
    });

    it("defines one clip outline for each span a layer is cut to", () => {
        expect(new Set(CLIPS.map(span => span.join(":"))).size).toBe(CLIPS.length);
        expect(CLIPS).toContainEqual([0, TERRAIN["^"].height]);
    });
});

describe("spriteBox", () => {
    it("stands a cell's footprint on its square: the diamond's front corner on the square's", () => {
        // A square's front corner is a diamond's height below its back corner.
        const box = spriteBox(GRASS[0]);
        expect(box).toEqual({ x: -10, y: -10, width: 20, height: 20 });
    });

    it("lifts a cut-down layer so its top is where it's cut to", () => {
        const column = TERRAIN_ART["^"][0];
        const [sprite] = column.sprites;
        const whole = spriteBox(sprite, { ...column, clip: undefined });
        const cut = spriteBox(sprite, column);
        // Raised by the height the cut leaves off: rise - clip quarters, 2.5 units each.
        expect(whole.y - cut.y).toBe(-(sprite.rise! - column.clip!) * 2.5);
    });

    it("draws a smaller sprite about the middle of its square", () => {
        const tree = TERRAIN_ART.T[0];
        const [sprite] = tree.sprites;
        const box = spriteBox(sprite, tree);
        expect(box.x + box.width / 2).toBe(0);
        // The footprint's middle — 16px up the cell — stays on the square's middle, 5 units down.
        expect(box.y + box.height - 16 * (box.width / sprite.width)).toBeCloseTo(5);
    });
});

describe("grassOf", () => {
    it("repeats every six diagonals each way, using every kind of grass once in that", () => {
        const seen = new Set<unknown>();
        for (let col = 0; col < 6; col++) {
            for (let row = 0; row < 6; row++) {
                seen.add(grassOf(col, row));
                expect(grassOf(col + 3, row + 3)).toBe(grassOf(col, row));
                expect(grassOf(col + 3, row - 3)).toBe(grassOf(col, row));
            }
        }
        expect(seen.size).toBe(GRASS.length);
    });
});

describe("variantOf", () => {
    it("picks a kind in range, the same for the same square", () => {
        for (let square = 0; square < 200; square++) {
            const kind = variantOf(square, 3);
            expect(kind).toBeGreaterThanOrEqual(0);
            expect(kind).toBeLessThan(3);
            expect(variantOf(square, 3)).toBe(kind);
        }
    });
});
