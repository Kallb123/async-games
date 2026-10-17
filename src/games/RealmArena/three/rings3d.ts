// The rings on the ground round a figure's feet (docs/realm-arena-3d.md §3):
// the one a figure is picked out by — chosen, a candidate for a tap, aimed at, a
// watcher a move would set off — and, outside it, the dashed one round a figure
// on watch or a squad still sealed. They lie flat on the top of the square the
// figure stands on, rather than facing the camera as its marks do
// (billboards.ts), so they're foreshortened with the ground as the isometric
// board's ellipses are.
//
// One `GroundRings` is one draw, of as many rings as it's handed: a
// `Billboards` that lies flat, with no camera axes. Each kind is drawn once,
// white, into a canvas atlas and tinted by its instance's colour; the sizes
// are the isometric board's (`RING_RADIUS`, `MARKER_RADIUS`, in its board
// units: a circle on the ground of that radius is the ellipse its SVG draws).

import type { Mesh } from "three";
import { MARKER_RADIUS, RING_RADIUS, type Marker, type Ring } from "@/games/RealmArena/ui";
import { ISO_HALF_HEIGHT, ISO_HALF_WIDTH } from "@/utils/ui/isometric";
import { Billboards, CanvasAtlas, type TexRect } from "./billboards";
import type { RingColours } from "./canvasShapes";
import type { Vec3 } from "./iso3d";

/** What is drawn round a figure's feet: a `Ring`, or the `Marker` outside it. */
export type RingKind = Ring | Marker;

/**
 * How each kind is drawn, as `.ag-ra-ring--*` and `.ag-ra-marker--*` write it
 * in ag-theme.css: its radius as a fraction of the square's diamond, its
 * stroke's width and, for a dashed one, the length of a dash and of the gap
 * after it, in board units.
 */
const LOOKS: Readonly<Record<RingKind, { radius: number; width: number; dash?: readonly [number, number]; colour: keyof RingColours }>> = {
    selected: { radius: RING_RADIUS, width: 0.9, colour: "onDark" },
    candidate: { radius: RING_RADIUS, width: 0.9, colour: "gold" },
    aimed: { radius: RING_RADIUS, width: 1.2, colour: "danger" },
    flagged: { radius: RING_RADIUS, width: 0.9, dash: [1.4, 0.9], colour: "danger" },
    watch: { radius: MARKER_RADIUS, width: 0.7, dash: [1.2, 0.8], colour: "onDark" },
    sealed: { radius: MARKER_RADIUS, width: 0.7, dash: [1.2, 0.8], colour: "oxblood" },
};

/**
 * How much wider a ring is stroked on the ground than the SVG strokes its
 * ellipse: lying flat it's foreshortened to half its width at the front and
 * the back, so it's widened to read as the ring the isometric board draws.
 */
const STROKE_BOOST = 1.4;
/** How far over the square's top a ring lies, in the world's units: clear of the ground it lies on. */
const ABOVE_GROUND = 0.012;

/** The canvas pixels a board unit takes in the atlas: a ring is a few dozen units across, so this keeps its stroke sharp at the deepest zoom. */
const ATLAS_SCALE = 12;

/** The length of an ellipse's edge, Ramanujan's approximation. */
function perimeter(a: number, b: number): number {
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/**
 * How many dashes go round a dashed ring of `radius`, so they fall evenly
 * round it: as many as the isometric board's ellipse of that radius holds, a
 * dash and a gap to each.
 */
export function dashCount(radius: number, [dash, gap]: readonly [number, number]): number {
    return Math.max(6, Math.round(perimeter(ISO_HALF_WIDTH * radius, ISO_HALF_HEIGHT * radius) / (dash + gap)));
}

/** The side of the square, in board units, that a ring of `kind` is drawn in: its diameter and half its stroke over. */
export function ringBox(kind: RingKind): number {
    const { radius, width } = LOOKS[kind];
    return 2 * (ISO_HALF_WIDTH * radius + width * STROKE_BOOST / 2);
}

/** Rings lying on the ground, every one from one atlas, in one draw. */
export class GroundRings {
    private readonly atlas = new CanvasAtlas(ATLAS_SCALE, 1024);
    private readonly billboards: Billboards;
    readonly mesh: Mesh;

    constructor() {
        // Under the figures' marks and over the shading on the ground; hidden by a wall that stands in front, as the figure's feet are.
        this.billboards = new Billboards(this.atlas.texture, null, { depthTest: true, order: 1, lift: ABOVE_GROUND });
        this.mesh = this.billboards.mesh;
    }

    /** Starts laying the rings out afresh: none are drawn until they're added again. */
    begin(): void {
        this.billboards.begin();
    }

    /** A ring of `kind` round `feet`, on the top of the square they stand on. */
    add(feet: Vec3, kind: RingKind, colours: RingColours): void {
        const rect = this.drawn(kind);
        // The rectangle the ring was drawn in is as many pixels as it's board units across.
        this.billboards.add({ at: feet, width: rect.width / ATLAS_SCALE, rect, colour: colours[LOOKS[kind].colour] });
    }

    /** Done laying out: what was added is what's drawn. */
    end(): void {
        this.billboards.end();
    }

    /** A ring of `kind` in white, drawn into the atlas the first time it's asked for. */
    private drawn(kind: RingKind): TexRect {
        const box = ringBox(kind);
        return this.atlas.rect(`ring:${kind}`, box, box, context => {
            const { radius, width, dash } = LOOKS[kind];
            const middle = box / 2, round = ISO_HALF_WIDTH * radius;
            context.strokeStyle = "#fff";
            context.lineWidth = width * STROKE_BOOST;
            context.beginPath();
            if (dash) {
                const count = dashCount(radius, dash), step = 2 * Math.PI / count, lit = step * dash[0] / (dash[0] + dash[1]);
                for (let i = 0; i < count; i++) {
                    context.moveTo(middle + round * Math.cos(i * step), middle + round * Math.sin(i * step));
                    context.arc(middle, middle, round, i * step, i * step + lit);
                }
            } else {
                context.arc(middle, middle, round, 0, 2 * Math.PI);
            }
            context.stroke();
        });
    }

    dispose(): void {
        this.billboards.dispose();
        this.atlas.dispose();
    }
}
