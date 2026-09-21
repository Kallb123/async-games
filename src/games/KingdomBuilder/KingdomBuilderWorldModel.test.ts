import { describe, expect, it } from "vitest";

import { KingdomBuilderWorldModel } from "./KingdomBuilderWorldModel";
import { generateWorld } from "./worldgen";
import type { OverlayPlacement } from "./worldgen/overlays";

describe("KingdomBuilderWorldModel", () => {
    it("persists the generated terrain field and its overlays", async () => {
        const generated = generateWorld("model-terrain-field");
        const world = new KingdomBuilderWorldModel({ ...generated, currentTick: 0 });
        await expect(world.validate()).resolves.toBeUndefined();
        expect(world.terrainField?.codes).toHaveLength(world.terrainField!.columns * world.terrainField!.rows);
        expect(world.overlays?.every((overlay: OverlayPlacement) => typeof overlay.tile === "number" && typeof overlay.code === "string")).toBe(true);
    });

    it("still validates a world with no terrain field at all — one generated before PR 9, never backfilled (§3.5.6)", async () => {
        const generated = generateWorld("model-no-field");
        const { terrainField: _terrainField, overlays: _overlays, ...withoutGround } = generated;
        const world = new KingdomBuilderWorldModel({ ...withoutGround, currentTick: 0 });
        await expect(world.validate()).resolves.toBeUndefined();
        expect(world.terrainField).toBeUndefined();
        expect(world.overlays).toBeUndefined();
    });
});
