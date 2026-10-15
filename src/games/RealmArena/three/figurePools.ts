// The 3D board's figures, as instanced draws (docs/realm-arena-3d.md): one pool
// of instances a character and a way of being drawn, so the draw calls stay few
// however many stand on the map.
//
// - `solid`: opaque, written to the depth buffer, so a wall hides whoever is
//   behind it by being in the way. Nearly every figure.
// - `faint`: blended, each instance by its own opacity — a figure the action
//   downs fading out as its fallen figure fades in, and a stale sighting in the
//   fog (§27). Drawn after everything solid. A pool only draws while something
//   is in it.
// - `hidden`: drawn only where something nearer hides it — the faint figure a
//   wall leaves visible — over the terrain and under the solid figures, so that
//   only the terrain hides it, never a figure's own limbs or a neighbour.
// - `outline`: each solid figure again as a dark inverted hull, which shows round
//   its edge as the sprites' outline does. Off (`OUTLINES`): it doubles the
//   triangles drawn, for a look the figures do without.

import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, type Matrix4, type Scene, type ShaderMaterial } from "three";
import type { CharacterId } from "@/games/RealmArena/characters";
import { characterGeometry, type CharacterModels } from "./characterModels";
import type { Vec3 } from "./iso3d";
import { lightSolids, solidMaterial } from "./solidMaterial";

export type PoolKind = "solid" | "faint" | "hidden" | "outline";

/** Whether every solid figure is drawn again as its dark outline (an inverted hull, `solidMaterial`'s `outline`): one more draw a character. */
export const OUTLINES = false;

/** How much of a figure shows through what hides it. */
const HIDDEN_OPACITY = 0.5;

/** When each kind is drawn, in its list: after the terrain (0), solid figures last of the opaque, faint ones over the ground's overlays. */
const RENDER_ORDER: Readonly<Record<PoolKind, number>> = { hidden: 1, solid: 2, outline: 2, faint: 1 };

/** The instances of one character drawn one way, the room they have and how many are in use. */
interface Pool {
    mesh: InstancedMesh;
    capacity: number;
    used: number;
    /** Each instance's opacity, for the `faint` kind. */
    opacity: InstancedBufferAttribute | null;
}

const WHITE = new Color(1, 1, 1);

export class FigurePools {
    private readonly pools = new Map<string, Pool>();
    private readonly materials = new Map<PoolKind, ShaderMaterial>();
    private lit: { light: Vec3; halfway: Vec3 } | null = null;

    constructor(private readonly scene: Scene) {}

    /** Turns the light of every figure drawn, now and later, to the camera's. */
    light(lit: { light: Vec3; halfway: Vec3 }): void {
        this.lit = lit;
        lightSolids([...this.materials.values()], lit);
    }

    /** Empties every pool, ready for the figures to be laid again. */
    begin(): void {
        for (const pool of this.pools.values()) pool.used = 0;
    }

    /** One figure into its character's pool of `kind`, growing the pool if it's full; `opacity` is the `faint` kind's. */
    place(models: CharacterModels, character: CharacterId, kind: PoolKind, matrix: Matrix4, tint: Color | null, opacity = 1): void {
        const key = kind === "solid" ? character : `${character}:${kind}`;
        let pool = this.pools.get(key);
        if (!pool || pool.used >= pool.capacity) pool = this.grow(key, models, character, kind, pool);
        pool.mesh.setMatrixAt(pool.used, matrix);
        pool.mesh.setColorAt(pool.used, tint ?? WHITE);
        pool.opacity?.setX(pool.used, opacity);
        pool.used++;
        if (kind === "solid" && OUTLINES) this.place(models, character, "outline", matrix, null);
    }

    /** Hands the GPU what was placed, and stops drawing the pools nothing was placed in. */
    end(): void {
        for (const { mesh, used, opacity } of this.pools.values()) {
            mesh.count = used;
            mesh.visible = used > 0;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            if (opacity) opacity.needsUpdate = true;
        }
    }

    dispose(): void {
        for (const material of this.materials.values()) material.dispose();
    }

    private materialOf(kind: PoolKind): ShaderMaterial {
        let material = this.materials.get(kind);
        if (!material) {
            material = solidMaterial({ perInstance: kind === "faint", behind: kind === "hidden", outline: kind === "outline", opacity: kind === "hidden" ? HIDDEN_OPACITY : 1 });
            if (this.lit) lightSolids([material], this.lit);
            this.materials.set(kind, material);
        }
        return material;
    }

    /** A pool of `kind` with room for twice what `was` held (or a few, to begin with), what it held carried over. */
    private grow(key: string, models: CharacterModels, character: CharacterId, kind: PoolKind, was: Pool | undefined): Pool {
        const capacity = Math.max(8, (was?.capacity ?? 0) * 2);
        // A faint pool's geometry is its own, since the opacity of each instance is an attribute of it.
        const geometry = kind === "faint" ? characterGeometry(models, character).clone() : characterGeometry(models, character);
        const opacity = kind === "faint" ? new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage) : null;
        if (opacity) geometry.setAttribute("instanceOpacity", opacity);
        const mesh = new InstancedMesh(geometry, this.materialOf(kind), capacity);
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.renderOrder = RENDER_ORDER[kind];
        mesh.setColorAt(0, WHITE);
        const used = was?.used ?? 0;
        if (was) {
            // Grown: what's placed so far carried over.
            mesh.instanceMatrix.array.set(was.mesh.instanceMatrix.array.subarray(0, used * 16));
            mesh.instanceColor!.array.set(was.mesh.instanceColor!.array.subarray(0, used * 3));
            opacity?.array.set(was.opacity!.array.subarray(0, used));
            this.scene.remove(was.mesh);
            was.mesh.dispose();
            if (kind === "faint") was.mesh.geometry.dispose();
        }
        const pool = { mesh, capacity, used, opacity };
        this.pools.set(key, pool);
        this.scene.add(mesh);
        return pool;
    }
}
