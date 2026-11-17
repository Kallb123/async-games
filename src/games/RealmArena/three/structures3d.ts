// What the 3D board draws for a structure (docs/realm-arena-3d.md, §39.7): the
// Swarm's nest has no model among the characters' (characters.json is
// figures), so it stands on its square as the isometric board draws it — its
// sprite (`NEST_ART`), a quad facing the camera hung from the square's middle.
// It's placed in the isometric board's own units from the box `spriteBox` gives
// the sprite there, so it stands the same size on the same spot.

import { Group } from "three";
import { spriteBox, type Sprite } from "@/games/RealmArena/art";
import { ISO_HALF_HEIGHT } from "@/utils/ui/isometric";
import { Billboards, sheetTexture, spriteRect, type BillboardAxes } from "./billboards";
import type { Vec3 } from "./iso3d";
import type { Sheets } from "./terrain3d";

/** Drawn over the ground's outlines and rings (1) and under the HP bars (2 and 3, board3d.ts). */
const STRUCTURE_ORDER = 1.5;
/** How far towards the camera it's drawn, in the world's units: as the marks are, so nothing beside it cuts into it. */
const STRUCTURE_LIFT = 0.5;

/** A sprite's quad as `Billboards` takes it, hung from a square's middle: where its middle is, right and down, and its width. */
export function structureQuad(sprite: Sprite): { x: number; y: number; width: number; height: number } {
    const box = spriteBox(sprite);
    // The isometric board puts the box's frame half a diamond above the square's middle.
    return { x: box.x + box.width / 2, y: box.y - ISO_HALF_HEIGHT + box.height / 2, width: box.width, height: box.height };
}

/** The structures on the board, laid out afresh with `begin`, an `add` a structure and `end`, whenever the figures are. */
export class StructureLayer {
    readonly group = new Group();
    private readonly billboards: Billboards;

    constructor(sheets: Sheets, axes: BillboardAxes) {
        // Hidden by whatever stands in front of it, as a figure is.
        this.billboards = new Billboards(sheetTexture(sheets, "nest"), axes, { depthTest: true, lift: STRUCTURE_LIFT, order: STRUCTURE_ORDER });
        this.group.add(this.billboards.mesh);
    }

    begin(): void {
        this.billboards.begin();
    }

    /** One structure drawn as `sprite`, standing with its foot at `feet`, `opacity` there. */
    add(feet: Vec3, sprite: Sprite, opacity = 1): void {
        this.billboards.add({ at: feet, ...structureQuad(sprite), rect: spriteRect(sprite), opacity });
    }

    end(): void {
        this.billboards.end();
    }

    dispose(): void {
        this.billboards.dispose();
    }
}
