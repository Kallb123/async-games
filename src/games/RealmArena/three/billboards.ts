// What the 3D board draws flat to the camera over its geometry
// (docs/realm-arena-3d.md §3): the marks on a figure, the hit text, the odds,
// a slash, a burst — everything the isometric board draws as a sprite or a
// label in its own SVG, here a quad that always faces the camera, hung from a
// point in the world and laid out across the frame in the isometric board's own
// units. So the sizes and offsets the isometric board draws them by (its
// `EFFECT_MARK_*`, `AP_PIP_*`, `ODDS_*` and the rest) carry over unchanged, and
// whatever a quad hangs from moves, turns and shakes with the camera with no
// work of its own.
//
// One `Billboards` is one draw, of as many quads as it's handed, all from one
// texture: an art sheet (`sheetTexture`, the sprites in `art.ts`), or a
// `CanvasAtlas` drawn into as it's needed (text, a pill, a dot). It's laid out
// afresh whenever its owner lays out what it shows — `begin`, an `add` a quad,
// `end` — a frame at a time while something moves, and not otherwise.
//
// Colours are as written (sRGB), like the solids' (solidMaterial.ts) and the
// sprites': a texel and a quad's `colour` are multiplied and written out as they
// are, so a mark in 3D is the colour of its sprite.

import {
    CanvasTexture, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, LinearFilter, LinearMipmapLinearFilter, Mesh, PlaneGeometry,
    ShaderMaterial, Texture, Vector3,
} from "three";
import type { Sprite } from "@/games/RealmArena/art";
import type { Sheets } from "./terrain3d";
import type { CameraBasis, Vec3 } from "./iso3d";

/**
 * The isometric board's units (its SVG's: a square's diamond 20 across) in
 * the world's, across the frame: a square's diagonal is √2 of the world's
 * units across the screen, and a full height — 10 board units up the screen —
 * is √2/2. The same both ways, so a quad sized in board units keeps its shape.
 */
export const BOARD_UNIT = Math.SQRT2 / 20;

/** A rectangle of a texture, in its pixels from the top left. */
export interface TexRect { x: number; y: number; width: number; height: number }

/** One quad, as `Billboards.add` takes it. Everything across the frame is in board units. */
export interface Billboard {
    /** The point in the world it hangs from. */
    at: Vec3;
    /** Where its middle is from `at` as the camera sees it: right, and down (the isometric board's y). */
    x?: number;
    y?: number;
    /** How wide it is, and how tall: by default as tall as the rectangle it shows is, for its width. */
    width: number;
    height?: number;
    /** What of the texture it shows. */
    rect: TexRect;
    /** Turned clockwise about its middle, in degrees, as an SVG `rotate` is. */
    rotate?: number;
    /** Grown about its middle. */
    scale?: number;
    opacity?: number;
    /** Multiplied into the texels: white leaves them as they are. */
    colour?: Color;
}

/**
 * Which way the camera faces, shared by every `Billboards` the board makes: its
 * `right` and `up` across the frame and its `back` towards the camera, which
 * the board sets as it turns (`setAxes`).
 */
export interface BillboardAxes {
    right: { value: Vector3 };
    up: { value: Vector3 };
    back: { value: Vector3 };
}

export function billboardAxes(): BillboardAxes {
    return { right: { value: new Vector3(1, 0, 0) }, up: { value: new Vector3(0, 1, 0) }, back: { value: new Vector3(0, 0, 1) } };
}

export function setAxes(axes: BillboardAxes, { right, up, back }: CameraBasis): void {
    axes.right.value.set(...right);
    axes.up.value.set(...up);
    axes.back.value.set(...back);
}

const vertexShader = /* glsl */ `
uniform vec3 right;
uniform vec3 up;
uniform vec3 back;
uniform float lift;
attribute vec3 at;
attribute vec4 place;
attribute vec4 rect;
attribute float spin;
attribute vec4 tint;
varying vec2 vUv;
varying vec4 vTint;
void main() {
    // Sized first and turned after, so a quad that isn't square turns as a rectangle and isn't sheared.
    vec2 corner = position.xy * place.zw;
    float s = sin(spin), c = cos(spin);
    corner = vec2(c * corner.x + s * corner.y, -s * corner.x + c * corner.y);
    vec2 across = place.xy + corner;
    vec3 world = at + right * across.x + up * across.y + back * lift;
    vUv = vec2(mix(rect.x, rect.z, uv.x), mix(rect.w, rect.y, uv.y));
    vTint = tint;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vTint;
void main() {
    vec4 texel = texture2D(map, vUv) * vTint;
    if (texel.a < 0.004) discard;
    gl_FragColor = texel;
}`;

/** How a `Billboards` is drawn among the rest. */
export interface BillboardOptions {
    /**
     * Hidden by whatever stands in front of what it hangs from, as the
     * isometric board's marks are by a wall drawn after them; by default it's
     * drawn over everything, as that board's effects layer is.
     */
    depthTest?: boolean;
    /** Drawn after anything with a lower order: the HP bars are 2 and 3. */
    order?: number;
    /** How far towards the camera it's drawn from what it hangs from, in the world's units, so the figure it hangs from never cuts into it. */
    lift?: number;
}

const WHITE = new Color(1, 1, 1);

/** Quads facing the camera, every one from `texture`, in one draw. */
export class Billboards {
    readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
    private capacity = 0;
    private count = 0;
    private attributes!: { at: InstancedBufferAttribute; place: InstancedBufferAttribute; rect: InstancedBufferAttribute; spin: InstancedBufferAttribute; tint: InstancedBufferAttribute };

    constructor(private readonly texture: Texture, axes: BillboardAxes, { depthTest = false, order = 10, lift = 0.5 }: BillboardOptions = {}) {
        const geometry = new InstancedBufferGeometry();
        const plane = new PlaneGeometry(1, 1);
        geometry.index = plane.index;
        geometry.setAttribute("position", plane.getAttribute("position"));
        geometry.setAttribute("uv", plane.getAttribute("uv"));
        const material = new ShaderMaterial({
            vertexShader,
            fragmentShader,
            transparent: true,
            depthTest,
            depthWrite: false,
            uniforms: { map: { value: texture }, lift: { value: lift }, ...axes },
        });
        this.mesh = new Mesh(geometry, material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = order;
        this.grow(16);
        geometry.instanceCount = 0;
    }

    private grow(capacity: number): void {
        const geometry = this.mesh.geometry;
        const make = (size: number, old?: InstancedBufferAttribute) => {
            const attribute = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
            attribute.setUsage(DynamicDrawUsage);
            if (old) (attribute.array as Float32Array).set(old.array as Float32Array);
            return attribute;
        };
        const old = this.attributes;
        this.attributes = {
            at: make(3, old?.at), place: make(4, old?.place), rect: make(4, old?.rect), spin: make(1, old?.spin), tint: make(4, old?.tint),
        };
        for (const [name, attribute] of Object.entries(this.attributes)) geometry.setAttribute(name, attribute);
        // three.js caps an instanced geometry at what its attributes held when it was first drawn, and keeps that cap through new attributes: let it find the new one.
        (geometry as unknown as { _maxInstanceCount?: number })._maxInstanceCount = undefined;
        this.capacity = capacity;
    }

    /** Starts laying the quads out afresh: none are drawn until they're added again. */
    begin(): void {
        this.count = 0;
    }

    add({ at, x = 0, y = 0, width, height, rect, rotate = 0, scale = 1, opacity = 1, colour = WHITE }: Billboard): void {
        if (opacity <= 0) return;
        if (this.count >= this.capacity) this.grow(this.capacity * 2);
        const image = this.texture.image as { width: number; height: number };
        const tall = height ?? width * rect.height / rect.width;
        const i = this.count++;
        const { at: where, place, rect: area, spin, tint } = this.attributes;
        where.setXYZ(i, at[0], at[1], at[2]);
        place.setXYZW(i, x * BOARD_UNIT, -y * BOARD_UNIT, width * scale * BOARD_UNIT, tall * scale * BOARD_UNIT);
        area.setXYZW(i, rect.x / image.width, rect.y / image.height, (rect.x + rect.width) / image.width, (rect.y + rect.height) / image.height);
        spin.setX(i, rotate * Math.PI / 180);
        tint.setXYZW(i, colour.r, colour.g, colour.b, opacity);
    }

    /** Done laying out: what was added is what's drawn. */
    end(): void {
        this.mesh.geometry.instanceCount = this.count;
        for (const attribute of Object.values(this.attributes)) attribute.needsUpdate = true;
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

/**
 * An art sheet as a texture the billboards draw its sprites from, made once a
 * sheet however many `Billboards` draw from it. Not flipped, so a sprite's
 * rectangle on the sheet is its rectangle of the texture.
 */
const sheetTextures = new WeakMap<HTMLImageElement, Texture>();
export function sheetTexture(sheets: Sheets, sheet: Sprite["sheet"]): Texture {
    const image = sheets[sheet];
    let texture = sheetTextures.get(image);
    if (!texture) {
        texture = new Texture(image);
        texture.flipY = false;
        texture.minFilter = LinearMipmapLinearFilter;
        texture.magFilter = LinearFilter;
        texture.needsUpdate = true;
        sheetTextures.set(image, texture);
    }
    return texture;
}

/** A sprite's rectangle of its sheet's texture. */
export const spriteRect = ({ x, y, width, height }: Sprite): TexRect => ({ x, y, width, height });

/**
 * A texture drawn into as it's needed, for what has no sprite: a line of text,
 * a pill with a number in it, a dot. Each thing is drawn once, under a key that
 * names it (its words and its look), at `scale` canvas pixels a board unit, and
 * `rect` hands back where it was drawn for a `Billboards` over this texture to
 * show. When it fills, it's cleared and starts again: what's drawn from it is
 * laid out afresh from `rect` each time it's laid out, so nothing holds an old
 * rectangle past that.
 */
export class CanvasAtlas {
    readonly texture: CanvasTexture;
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;
    private readonly drawn = new Map<string, TexRect>();
    private shelf = { x: 0, y: 0, height: 0 };

    /** `scale` canvas pixels a board unit: enough to stay sharp at the deepest zoom on a dense screen. */
    constructor(readonly scale = 12, size = 1024) {
        this.canvas = document.createElement("canvas");
        this.canvas.width = this.canvas.height = size;
        this.context = this.canvas.getContext("2d")!;
        this.texture = new CanvasTexture(this.canvas);
        this.texture.flipY = false;
        this.texture.minFilter = LinearMipmapLinearFilter;
        this.texture.magFilter = LinearFilter;
    }

    /**
     * Where `key` is drawn, drawing it first if it isn't yet: `draw` is handed
     * the context scaled to board units, with its origin at the top left of a
     * `width` by `height` box (board units) to draw in.
     */
    rect(key: string, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): TexRect {
        const known = this.drawn.get(key);
        if (known) return known;
        const pad = 2;
        const w = Math.ceil(width * this.scale) + 2 * pad, h = Math.ceil(height * this.scale) + 2 * pad;
        if (this.shelf.x + w > this.canvas.width) this.shelf = { x: 0, y: this.shelf.y + this.shelf.height, height: 0 };
        if (this.shelf.y + h > this.canvas.height) this.clear();
        const at = { x: this.shelf.x + pad, y: this.shelf.y + pad };
        const context = this.context;
        context.save();
        context.translate(at.x, at.y);
        context.scale(this.scale, this.scale);
        draw(context);
        context.restore();
        this.shelf.x += w;
        this.shelf.height = Math.max(this.shelf.height, h);
        const rect = { x: at.x, y: at.y, width: w - 2 * pad, height: h - 2 * pad };
        this.drawn.set(key, rect);
        this.texture.needsUpdate = true;
        return rect;
    }

    /** How wide `text` is in `font` (a canvas font in board units, e.g. `800 3.1px Bricolage Grotesque`), in board units. */
    measure(text: string, font: string): number {
        this.context.save();
        this.context.font = font;
        const width = this.context.measureText(text).width;
        this.context.restore();
        return width;
    }

    private clear(): void {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawn.clear();
        this.shelf = { x: 0, y: 0, height: 0 };
    }

    dispose(): void {
        this.texture.dispose();
    }
}
