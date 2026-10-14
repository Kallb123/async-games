// Realm Arena's characters as real geometry, for the 3D board
// (docs/realm-arena-3d.md): each master in art-masters/realmarena/characters,
// the same list of boxes, balls, capsules and tapered cylinders that
// `npm run ra-characters` ray-casts into the sprite sheet, built as three.js
// solids and merged into one geometry a character, so every figure of a kind is
// one instanced draw.
//
// A model is written in its own frame — x forward, y to its left, z up, a
// square's side to the unit, the origin the middle of its square on the ground
// (art-masters/realmarena/characters/kit.mjs) — and stays in it here: the board
// turns, poses and places each figure with its instance matrix (`figureMatrix`
// in iso3d.ts). Each vertex carries its material's colour, as written, and its
// flags: whether it is the owner's colour (tinted per figure), glows (unlit) or
// shines (takes a highlight), which the figure shader (figureMaterial.ts) reads.

import { BoxGeometry, BufferGeometry, CapsuleGeometry, Color, CylinderGeometry, Euler, Float32BufferAttribute, Matrix4, SphereGeometry, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CharacterId } from "@/games/RealmArena/characters";
import { MATERIALS } from "../../../../art-masters/realmarena/characters/kit.mjs";
import { parts as archer } from "../../../../art-masters/realmarena/characters/archer.mjs";
import { parts as bloater } from "../../../../art-masters/realmarena/characters/bloater.mjs";
import { parts as broodmother } from "../../../../art-masters/realmarena/characters/broodmother.mjs";
import { parts as cleric } from "../../../../art-masters/realmarena/characters/cleric.mjs";
import { parts as knight } from "../../../../art-masters/realmarena/characters/knight.mjs";
import { parts as mage } from "../../../../art-masters/realmarena/characters/mage.mjs";
import { parts as manAtArms } from "../../../../art-masters/realmarena/characters/manAtArms.mjs";
import { parts as miner } from "../../../../art-masters/realmarena/characters/miner.mjs";
import { parts as prospector } from "../../../../art-masters/realmarena/characters/prospector.mjs";
import { parts as ravager } from "../../../../art-masters/realmarena/characters/ravager.mjs";
import { parts as runepriest } from "../../../../art-masters/realmarena/characters/runepriest.mjs";
import { parts as sapper } from "../../../../art-masters/realmarena/characters/sapper.mjs";
import { parts as scout } from "../../../../art-masters/realmarena/characters/scout.mjs";
import { parts as skitterling } from "../../../../art-masters/realmarena/characters/skitterling.mjs";
import { parts as spitter } from "../../../../art-masters/realmarena/characters/spitter.mjs";
import { parts as stonewarden } from "../../../../art-masters/realmarena/characters/stonewarden.mjs";

type Vec3 = readonly [number, number, number];
/** A part's turn, in degrees: rolled about x, then pitched about y, then yawed about z, as a master writes it. */
type Rotation = { x?: number; y?: number; z?: number };

/** One part of a master, as `solidOf` in scripts/lib/isoRender.mjs reads it. */
type Part = { mat: string } & (
    | { box: { at: Vec3; size: Vec3; rot?: Rotation } | { from: Vec3; to: Vec3; size: readonly [number, number]; roll?: number } }
    | { ball: { at: Vec3; r: number | Vec3; rot?: Rotation } }
    | { taper: { from: Vec3; to: Vec3; r: number; r2?: number; roll?: number } }
    | { capsule: { from: Vec3; to: Vec3; r: number } }
);

interface Material { colour: string; team?: boolean; glow?: boolean; shine?: number }

/** Every character's master. A `Record` of every id, so a character added to the game without a model fails to compile. */
const MASTERS: Record<CharacterId, readonly Part[]> = {
    archer, bloater, broodmother, cleric, knight, mage, manAtArms, miner, prospector,
    ravager, runepriest, sapper, scout, skitterling, spitter, stonewarden,
} as unknown as Record<CharacterId, readonly Part[]>;

/**
 * How finely the round solids are cut. Low on purpose: a figure is a few
 * dozen pixels tall at the deepest zoom, and the board draws dozens of them.
 */
const SEGMENTS = { sphere: [10, 6], radial: 8, cap: 2 } as const;

const rad = (degrees = 0) => degrees * Math.PI / 180;
const vec = ([x, y, z]: Vec3) => new Vector3(x, y, z);

/** A turn as a master writes one: about x first, then y, then z. */
const turned = (rot: Rotation = {}) => new Matrix4().makeRotationFromEuler(new Euler(rad(rot.x), rad(rot.y), rad(rot.z), "ZYX"));

/**
 * Axes whose z runs from `from` to `to`, turned `roll` degrees about it — as
 * `basisAlong` in scripts/lib/isoRender.mjs makes them — as a matrix taking a
 * solid built along its own y (as three.js builds cylinders and capsules) onto
 * that run: y onto the run, x onto the basis's x, and z onto the third axis.
 */
function along(from: Vec3, to: Vec3, roll = 0): Matrix4 {
    const z = vec(to).sub(vec(from)).normalize();
    const reference = Math.abs(z.z) > 0.95 ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
    const x = new Vector3().crossVectors(reference, z).normalize().applyAxisAngle(z, rad(roll));
    const y = new Vector3().crossVectors(z, x);
    return new Matrix4().makeBasis(x, z, y.negate());
}

/** One part as a solid in the model's frame. */
function solid(part: Part): BufferGeometry {
    if ("box" in part) {
        const box = part.box;
        if ("from" in box) {
            const length = vec(box.to).distanceTo(vec(box.from));
            // Built along y, so its length runs from one end to the other.
            const geometry = new BoxGeometry(box.size[0], length, box.size[1]);
            const centre = vec(box.from).add(vec(box.to)).multiplyScalar(0.5);
            return geometry.applyMatrix4(along(box.from, box.to, box.roll).setPosition(centre));
        }
        return new BoxGeometry(...box.size).applyMatrix4(turned(box.rot).setPosition(vec(box.at)));
    }
    if ("ball" in part) {
        const { at, r, rot } = part.ball;
        const [rx, ry, rz] = typeof r === "number" ? [r, r, r] : r;
        const geometry = new SphereGeometry(1, ...SEGMENTS.sphere).applyMatrix4(new Matrix4().makeScale(rx, ry, rz));
        return geometry.applyMatrix4(turned(rot).setPosition(vec(at)));
    }
    if ("taper" in part) {
        const { from, to, r, r2 = r, roll } = part.taper;
        const length = vec(to).distanceTo(vec(from));
        const centre = vec(from).add(vec(to)).multiplyScalar(0.5);
        return new CylinderGeometry(r2, r, length, SEGMENTS.radial).applyMatrix4(along(from, to, roll).setPosition(centre));
    }
    const { from, to, r } = part.capsule;
    const length = vec(to).distanceTo(vec(from));
    const centre = vec(from).add(vec(to)).multiplyScalar(0.5);
    return new CapsuleGeometry(r, length, SEGMENTS.cap, SEGMENTS.radial).applyMatrix4(along(from, to).setPosition(centre));
}

/** A part's solid, every vertex coloured and flagged by its material. */
function dressed(part: Part, materials: Readonly<Record<string, Material>>): BufferGeometry {
    const material = materials[part.mat];
    if (!material) throw new Error(`No material "${part.mat}" in kit.mjs`);
    const geometry = solid(part);
    geometry.deleteAttribute("uv");
    const count = geometry.getAttribute("position").count;
    // The colour as written — sRGB, as the sprite renderer shades it — not converted to linear.
    const { r, g, b } = new Color().setStyle(material.colour, "srgb-linear");
    const flags = [material.team ? 1 : 0, material.glow ? 1 : 0, material.shine ?? 0];
    geometry.setAttribute("color", new Float32BufferAttribute(Array.from({ length: count }, () => [r, g, b]).flat(), 3));
    geometry.setAttribute("flags", new Float32BufferAttribute(Array.from({ length: count }, () => flags).flat(), 3));
    return geometry;
}

const built = new Map<CharacterId, BufferGeometry>();

/** A character's model, merged into one geometry in its own frame: built once, and shared by every board. */
export function characterGeometry(character: CharacterId): BufferGeometry {
    let geometry = built.get(character);
    if (!geometry) {
        const parts = MASTERS[character];
        const merged = mergeGeometries(parts.map(part => dressed(part, MATERIALS as Record<string, Material>)));
        if (!merged) throw new Error(`${character}'s parts couldn't be merged`);
        merged.computeBoundingSphere();
        geometry = merged;
        built.set(character, geometry);
    }
    return geometry;
}
