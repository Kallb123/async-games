// The soft shadow on the ground under each figure (docs/realm-arena-3d.md §2.2),
// which the isometric board draws as an ellipse (`.ag-ra-shadow`) and without
// which a figure looks pasted on the grass. Like the rings round its feet
// (rings3d.ts) it lies flat on the top of the square the figure stands on: one
// `Billboards` that lies flat, so every shadow is one instanced draw. It is the
// one soft disc, drawn once, white, into a canvas atlas and laid black and at
// the shadow's strength, scaled by each figure's own.
//
// Over the ground's shading and the strokes round its areas, and under the rings
// and the figures; hidden by a wall that stands in front, as the figure's feet are.

import { Color, type Mesh } from "three";
import { SHADOW_ALPHA, SHADOW_RADIUS } from "@/games/RealmArena/ui";
import { ISO_HALF_WIDTH } from "@/utils/ui/isometric";
import { Billboards, CanvasAtlas, type TexRect } from "./billboards";
import type { Vec3 } from "./iso3d";

/**
 * How far the soft edge reaches past the ellipse, as a fraction of its radius:
 * the shadow is half strength at the radius itself, where the isometric
 * board's hard edge is, and fades to nothing this far beyond it.
 */
const FEATHER = 0.12;
/** How far over the square's top a shadow lies, in the world's units: over the strokes round the shaded areas (outlines3d.ts) and under the rings (rings3d.ts). */
const ABOVE_GROUND = 0.010;
/** Drawn after the strokes round the shaded areas (`OUTLINE_ORDER` in board3d.ts, and the wave's) and before the rings. */
const ORDER = 0.75;

/** The canvas pixels a board unit takes in the atlas: the edge is soft, so far fewer than a ring's. */
const ATLAS_SCALE = 8;

/** The radius of the ellipse's circle on the ground, in board units: the isometric board's `rx`. */
export const shadowRadius = ISO_HALF_WIDTH * SHADOW_RADIUS;

/** The side of the square, in board units, the shadow is drawn in: its diameter and its soft edge's reach over. */
export const shadowBox = 2 * shadowRadius * (1 + FEATHER);

const BLACK = new Color(0, 0, 0);

/** Shadows lying on the ground, every one the same soft disc, in one draw. */
export class GroundShadows {
    private readonly atlas = new CanvasAtlas(ATLAS_SCALE, 128);
    private readonly billboards: Billboards;
    readonly mesh: Mesh;

    constructor() {
        this.billboards = new Billboards(this.atlas.texture, null, { depthTest: true, order: ORDER, lift: ABOVE_GROUND });
        this.mesh = this.billboards.mesh;
    }

    /** Starts laying the shadows out afresh: none are drawn until they're added again. */
    begin(): void {
        this.billboards.begin();
    }

    /** A shadow under `feet`, on the top of the square they stand on, as strong as `strength` (0–1) of the shadow's own: a figure fading takes its shadow with it. */
    add(feet: Vec3, strength = 1): void {
        if (strength <= 0) return;
        // The rectangle the disc was drawn in is as many pixels as it's board units across.
        const rect = this.disc();
        this.billboards.add({ at: feet, width: rect.width / ATLAS_SCALE, rect, colour: BLACK, opacity: SHADOW_ALPHA * strength });
    }

    /** Done laying out: what was added is what's drawn. */
    end(): void {
        this.billboards.end();
    }

    /** The disc, white and soft at its edge, drawn into the atlas the first time it's asked for. */
    private disc(): TexRect {
        return this.atlas.rect("shadow", shadowBox, shadowBox, context => {
            const middle = shadowBox / 2;
            // Full strength to the ellipse's edge less the soft edge's half, and none by its reach past it.
            const reach = 1 + FEATHER, inner = (1 - FEATHER) / reach, half = 1 / reach;
            const fade = context.createRadialGradient(middle, middle, 0, middle, middle, middle);
            fade.addColorStop(0, "#fff");
            fade.addColorStop(inner, "#fff");
            fade.addColorStop(half, "rgba(255, 255, 255, 0.5)");
            fade.addColorStop(1, "rgba(255, 255, 255, 0)");
            context.fillStyle = fade;
            context.fillRect(0, 0, shadowBox, shadowBox);
        });
    }

    dispose(): void {
        this.billboards.dispose();
        this.atlas.dispose();
    }
}
