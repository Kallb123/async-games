import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { CHARACTER_MODELS_HREF } from "@/games/RealmArena/art";
import { CHARACTER_IDS } from "@/games/RealmArena/roster";
import { modelsJson } from "../../../../scripts/lib/characterModels.mjs";
import { characterGeometry, type CharacterModels } from "./characterModels";

const ROOT = path.resolve(__dirname, "../../../..");
const MASTERS = path.join(ROOT, "art-masters", "realmarena", "characters");
/** The models as the 3D board fetches them. */
const file = readFileSync(path.join(ROOT, "public", CHARACTER_MODELS_HREF), "utf8");
const served = JSON.parse(file) as CharacterModels;

describe("the 3D board's characters", () => {
    it("serves every master as it stands: run npm run ra-characters after changing one", async () => {
        const master = (name: string) => import(pathToFileURL(path.join(MASTERS, `${name}.mjs`)).href);
        const { MATERIALS } = await master("kit");
        const parts = Object.fromEntries(await Promise.all(CHARACTER_IDS.map(async id => [id, (await master(id)).parts])));
        expect(file).toBe(modelsJson(MATERIALS, parts));
    });

    it("builds every character's model from what's served", () => {
        for (const id of CHARACTER_IDS) {
            const geometry = characterGeometry(served, id);
            expect(geometry.getAttribute("position").count, id).toBeGreaterThan(100);
            expect(geometry.getAttribute("color").count, id).toBe(geometry.getAttribute("position").count);
            expect(geometry.getAttribute("flags").count, id).toBe(geometry.getAttribute("position").count);
            // Standing on its square: nothing far below the ground, and about a figure's height.
            const { center, radius } = geometry.boundingSphere!;
            expect(center.z - radius, id).toBeGreaterThan(-0.5);
            expect(center.z + radius, id).toBeLessThan(1.6);
        }
    });
});
