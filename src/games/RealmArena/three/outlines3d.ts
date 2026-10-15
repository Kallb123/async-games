// The outline round an area on the 3D board's ground (docs/realm-arena-3d.md
// §3): a deployment zone's dashed edge, the centre's, a blast's, the squares a
// pick may be placed on. The geometry is outlines.ts's; this lays it as strips
// of ground, flat to the world and a little over it, all in one draw: a
// vertex's colour carries the stroke's colour and its strength, and a dash is
// a gap in the geometry rather than a pattern in a shader.
//
// Over the shading and under whatever stands up, and hidden by a wall in front
// of it, as the shading is: it is laid on the ground like it, at the height of
// the square's top (`groundHeight`).

import { BufferGeometry, type Color, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial } from "three";
import type { Battlefield, Square } from "@/utils/games/battlefield/terrain";
import { boundaryRuns, dashesOf, solidOf, strokeLength, strokeWidth, stripCorners } from "./outlines";
import { groundHeight } from "./terrain3d";

/** One area's stroke: the squares it is drawn round, its colour (sRGB, as written) and strength (0–1), and its width and dash in the isometric board's units, as its CSS writes them. */
export interface Outline {
    squares: ReadonlySet<Square>;
    colour: Color;
    alpha: number;
    width: number;
    /** A dash and the gap after it; none for a solid line. */
    dash?: readonly [number, number];
}

/**
 * How far over the square's top a stroke lies, in the world's units: over the
 * shading (0.004, the wave's 0.006) and under the rings (0.012). Its
 * polygon offset keeps it clear of that ground at a distance, where depth
 * doesn't tell them apart.
 */
const ABOVE_GROUND = 0.009;

/** Whether `a` and `b` are the same strokes round the same squares, which are laid out the same wherever the field is. */
function sameOutlines(a: readonly Outline[], b: readonly Outline[]): boolean {
    return a.length === b.length && a.every((one, i) => {
        const other = b[i];
        return one.alpha === other.alpha && one.width === other.width && one.colour.equals(other.colour)
            && one.dash?.[0] === other.dash?.[0] && one.dash?.[1] === other.dash?.[1]
            && one.squares.size === other.squares.size && [...one.squares].every(square => other.squares.has(square));
    });
}

/** The strokes of some areas, drawn in one draw: later ones over earlier, as the isometric board paints them. */
export class GroundOutlines {
    readonly mesh: Mesh;
    private readonly material = new MeshBasicMaterial({
        vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide,
        // A strip lies flat and writes no depth, so its back and front need no ordering: one pass, not the two a transparent double-sided material is drawn in.
        forceSinglePass: true,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });

    /** What is laid out now, so asking for the same again, as the board does whenever anything it shades changes, costs nothing. */
    private laid: { field: Battlefield; outlines: readonly Outline[] } | null = null;

    /** Drawn after what's under it: `order` over the shading and rings. */
    constructor(order: number) {
        this.mesh = new Mesh(new BufferGeometry(), this.material);
        this.mesh.renderOrder = order;
        this.mesh.frustumCulled = false;
        this.mesh.visible = false;
    }

    /** How strongly all of it is drawn, 0–1, over each stroke's own: the wave's breathing. */
    set opacity(opacity: number) {
        this.material.opacity = opacity;
    }

    /** Lays `outlines` out afresh on `field`'s ground. */
    set(field: Battlefield, outlines: readonly Outline[]): void {
        if (this.laid?.field === field && sameOutlines(this.laid.outlines, outlines)) return;
        this.laid = { field, outlines };
        const positions: number[] = [], colours: number[] = [], indices: number[] = [];
        for (const { squares, colour, alpha, width, dash } of outlines) {
            const across = strokeWidth(width);
            // Vertex colours are read as linear, and the board's are as written.
            const [r, g, b] = colour.clone().convertSRGBToLinear().toArray();
            for (const run of boundaryRuns(field, squares, square => groundHeight(field, square))) {
                // A stroke's width is filled in at the corners, past the run's end.
                const pieces = dash ? dashesOf(run, [strokeLength(dash[0]), strokeLength(dash[1])], across / 2) : [solidOf(run, across / 2)];
                for (const piece of pieces) {
                    const first = positions.length / 3;
                    for (const corner of stripCorners(piece, across, ABOVE_GROUND)) {
                        positions.push(...corner);
                        colours.push(r, g, b, alpha);
                    }
                    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
                }
            }
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
        geometry.setAttribute("color", new Float32BufferAttribute(colours, 4));
        geometry.setIndex(indices);
        this.mesh.geometry.dispose();
        this.mesh.geometry = geometry;
        this.mesh.visible = indices.length > 0;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}
