// The battlefield's ground and what stands on it, for the 3D board
// (docs/realm-arena-3d.md), drawn from the same tile art the isometric board
// draws from (src/games/RealmArena/art.ts):
//
// - the ground is one texture over one plane: each square's grass diamond — and
//   scorched ground where cover was blasted (§22) — unwarped from its sheet
//   into the square it covers, with the lines between squares over it;
// - every raised square is a box from the ground up to its top, one instanced
//   draw a terrain, its faces and its top coloured from its own sprites;
// - trees are a trunk and two cones, one instanced draw for every tree;
// - an overlay with a texel a square carries what's shaded on the ground — on
//   the top of a raised square too: deployment zones, fog (§27), smoke, a
//   reach, a range, a blast.

import {
    BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DataTexture, DoubleSide, Float32BufferAttribute,
    Group, InstancedMesh, LinearMipmapLinearFilter, Matrix4, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, RGBAFormat, SRGBColorSpace, type ShaderMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ART_SHEETS, grassOf, TERRAIN_ART, variantOf, type ArtSheet, type Sprite } from "@/games/RealmArena/art";
import { terrainLetter } from "@/games/RealmArena/ui";
import type { Battlefield, Square, TerrainLetter } from "@/utils/games/battlefield/terrain";
import { QUARTER } from "./iso3d";
import { solidMaterial } from "./solidMaterial";

/** The sheets, loaded: what the ground is unwarped from and the terrain's colours are sampled from. */
export type Sheets = Readonly<Record<ArtSheet, HTMLImageElement>>;

export function loadSheets(): Promise<Sheets> {
    return Promise.all(Object.entries(ART_SHEETS).map(([name, sheet]) => new Promise<[string, HTMLImageElement]>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve([name, image]);
        image.onerror = () => reject(new Error(`couldn't load ${sheet.href}`));
        image.src = sheet.href;
    }))).then(entries => Object.fromEntries(entries) as Sheets);
}

/**
 * How many texels a square of ground gets: as many as fit 2,048 across the
 * longer side, between 8 and 32. A big map's ground is softer close up, and
 * its texture stays a size a phone's GPU holds comfortably.
 */
const groundTexels = (field: Battlefield) => Math.max(8, Math.min(32, Math.floor(2048 / Math.max(field.width, field.height))));

/** The width of a square's diamond on a sheet, and where a flat cell's diamond lies in it: its top corner, a quarter of a cell down from the middle of its top. */
const TILE_PX = 64;
/** How much larger than its square a diamond is drawn (`unwarped`). */
const OVERDRAW = 1.12;

/**
 * A flat sprite's diamond (grass, scorched ground) drawn square, `size` texels
 * a side: the diamond's top, right and left corners onto the square's
 * top-left, top-right and bottom-left — the corners of the square they are
 * on the isometric board, where a square's columns run down to the right.
 */
function unwarped(sheets: Sheets, sprite: Sprite, size: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d")!;
    const top = { x: sprite.x + TILE_PX / 2, y: sprite.y + sprite.height - TILE_PX / 2 };
    // The inverse of the diamond's two edges from its top corner: (32, 16) along a column, (-32, 16) down a row —
    // drawn a little larger than the square about its middle, so the dark rim the art draws round each
    // diamond falls outside it and the squares meet clean, the grid drawn over them instead.
    const k = OVERDRAW * size / (TILE_PX * TILE_PX / 4);
    const [a, b, c, d] = [16 * k, -16 * k, 32 * k, 32 * k];
    const middle = { x: top.x, y: top.y + TILE_PX / 4 };
    context.setTransform(a, b, c, d, size / 2 - (a * middle.x + c * middle.y), size / 2 - (b * middle.x + d * middle.y));
    context.drawImage(sheets[sprite.sheet], sprite.x, sprite.y, sprite.width, sprite.height, sprite.x, sprite.y, sprite.width, sprite.height);
    return canvas;
}

/** The ground's texture: every square's grass, or what scorched ground lies there, and the lines between squares. */
function groundTexture(field: Battlefield, sheets: Sheets): CanvasTexture {
    const size = groundTexels(field);
    const canvas = document.createElement("canvas");
    canvas.width = field.width * size;
    canvas.height = field.height * size;
    const context = canvas.getContext("2d")!;
    const cells = new Map<Sprite, HTMLCanvasElement>();
    const cellOf = (sprite: Sprite) => {
        let cell = cells.get(sprite);
        if (!cell) cells.set(sprite, cell = unwarped(sheets, sprite, size));
        return cell;
    };
    const scorched = TERRAIN_ART._[0].sprites;
    for (let square = 0; square < field.tiles.length; square++) {
        const col = square % field.width, row = Math.floor(square / field.width);
        context.drawImage(cellOf(grassOf(col, row)), col * size, row * size);
        if (terrainLetter(field, square) === "_") context.drawImage(cellOf(scorched[variantOf(square, scorched.length)]), col * size, row * size);
    }
    // The grid, as faint as the isometric board's (`.ag-ra-grid`).
    context.strokeStyle = "rgba(0, 0, 0, 0.07)";
    context.lineWidth = Math.max(1, size / 24);
    context.beginPath();
    for (let col = 0; col <= field.width; col++) context.moveTo(col * size, 0), context.lineTo(col * size, canvas.height);
    for (let row = 0; row <= field.height; row++) context.moveTo(0, row * size), context.lineTo(canvas.width, row * size);
    context.stroke();
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = 4;
    return texture;
}

/**
 * The average colour of what's drawn of a sprite, as sRGB 0–1: all of it, or
 * with `top`, the band of it nearest the top of its cell — the top face of the
 * block it draws, lit full on.
 */
function sampled(sheets: Sheets, sprite: Sprite, top = false): Color {
    const canvas = document.createElement("canvas");
    canvas.width = sprite.width;
    canvas.height = sprite.height;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(sheets[sprite.sheet], sprite.x, sprite.y, sprite.width, sprite.height, 0, 0, sprite.width, sprite.height);
    const { data } = context.getImageData(0, 0, sprite.width, sprite.height);
    const opaque = (i: number) => data[i + 3] >= 200;
    let first = 0;
    while (first < sprite.height && !Array.from({ length: sprite.width }, (_, x) => opaque((first * sprite.width + x) * 4)).some(Boolean)) first++;
    const [from, to] = top ? [first, first + TILE_PX / 4] : [first, sprite.height];
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = from; y < Math.min(to, sprite.height); y++) {
        for (let x = 0; x < sprite.width; x++) {
            const i = (y * sprite.width + x) * 4;
            if (!opaque(i)) continue;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
    }
    return n === 0 ? new Color(0.5, 0.5, 0.5) : new Color(r / n / 255, g / n / 255, b / n / 255);
}

/**
 * How much brighter a sprite's colour is taken than it's drawn: the art's own
 * shading is in what's sampled, and the solid shader shades it again, so the
 * colour is lifted back towards the lit face's before it is.
 */
const UNSHADED = 1.3;

/** A raised terrain's colours: its faces, from all of its first layer's art, and its top, from the top of its last. */
function blockColours(sheets: Sheets, letter: TerrainLetter): { side: Color; top: Color } {
    const layers = TERRAIN_ART[letter];
    const lift = (colour: Color) => new Color(Math.min(1, colour.r * UNSHADED), Math.min(1, colour.g * UNSHADED), Math.min(1, colour.b * UNSHADED));
    return { side: lift(sampled(sheets, layers[0].sprites[0])), top: sampled(sheets, layers[layers.length - 1].sprites[0], true) };
}

/** Every vertex `colour`, its top face `top`, and no flags: a solid the solid shader draws as it is. */
function coloured(geometry: BufferGeometry, colour: Color, top = colour): BufferGeometry {
    const normals = geometry.getAttribute("normal");
    const colours: number[] = [];
    for (let i = 0; i < normals.count; i++) colours.push(...(normals.getY(i) > 0.5 ? top : colour).toArray());
    geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
    geometry.setAttribute("flags", new Float32BufferAttribute(new Array(normals.count * 3).fill(0), 3));
    geometry.deleteAttribute("uv");
    return geometry;
}

/** A tree: a trunk and two cones of crown, standing on the middle of its square, a little under the height that hides a character (§25). */
function treeGeometry(crown: Color): BufferGeometry {
    const trunk = coloured(new CylinderGeometry(0.05, 0.07, 0.3, 7).translate(0, 0.15, 0), new Color(0.36, 0.25, 0.16));
    const lower = coloured(new ConeGeometry(0.38, 0.62, 9).translate(0, 0.52, 0), crown);
    const upper = coloured(new ConeGeometry(0.27, 0.48, 9).translate(0, 0.86, 0), crown.clone().offsetHSL(0, 0, 0.05));
    return mergeGeometries([trunk, lower, upper])!;
}

/** What the ground and the terrain are drawn with, built once a battlefield. */
export interface Terrain {
    group: Group;
    /** Every material drawn with the solid shader, for the light to turn with the camera. */
    solids: ShaderMaterial[];
    /** The overlay's texels, four bytes a square in the map's order, and the texture to tell when they change. */
    overlay: { data: Uint8Array; texture: DataTexture };
    /** The wave's overlay (§30.11), drawn separately so it can breathe. */
    wave: { data: Uint8Array; texture: DataTexture; material: MeshBasicMaterial };
    dispose(): void;
}

/**
 * How high the ground stands under a square, in the world's units: the top of
 * a raised block, or — for a tree, whose trunk stands on it — the ground the
 * tree is rooted in. What an overlay lies on, and so what shows through to the
 * eye on a raised top rather than being hidden under it.
 */
export function groundHeight(field: Battlefield, square: Square): number {
    const { elevation, terrain } = field.tiles[square];
    return (terrainLetter(field, square) === "T" ? elevation - terrain.height : elevation) * QUARTER;
}

/**
 * A plane over the whole map at `lift` above the ground, its texture's texel
 * per square. The plane lies on the flat ground, and each raised square wears a
 * quad of its own lifted onto its top, so what's shaded on a block shows on the
 * block and not under it. All of it one mesh, one draw.
 */
function overlayPlane(field: Battlefield, lift: number, opacity = 1): { data: Uint8Array; texture: DataTexture; mesh: Mesh; material: MeshBasicMaterial } {
    const data = new Uint8Array(field.width * field.height * 4);
    const texture = new DataTexture(data, field.width, field.height, RGBAFormat);
    texture.magFilter = texture.minFilter = NearestFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity, side: DoubleSide });
    const { width, height } = field;
    // The plane first, its texture's first row the map's first row; then a quad a raised square, all four corners on that square's texel.
    const positions = [0, lift, 0, width, lift, 0, width, lift, height, 0, lift, height];
    const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    const indices = [0, 1, 2, 0, 2, 3];
    for (let square = 0; square < field.tiles.length; square++) {
        const top = groundHeight(field, square);
        if (top <= lift) continue;
        const col = square % width, row = Math.floor(square / width);
        const first = positions.length / 3;
        positions.push(col, top + lift, row, col + 1, top + lift, row, col + 1, top + lift, row + 1, col, top + lift, row + 1);
        const u = (col + 0.5) / width, v = (row + 0.5) / height;
        uvs.push(u, v, u, v, u, v, u, v);
        indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    return { data, texture, mesh: new Mesh(geometry, material), material };
}

export function buildTerrain(field: Battlefield, sheets: Sheets): Terrain {
    const group = new Group();
    const solids: ShaderMaterial[] = [];
    const disposables: { dispose(): void }[] = [];

    const ground = groundTexture(field, sheets);
    const groundMaterial = new MeshBasicMaterial({ map: ground });
    const groundMesh = new Mesh(new PlaneGeometry(field.width, field.height).rotateX(-Math.PI / 2).translate(field.width / 2, 0, field.height / 2), groundMaterial);
    group.add(groundMesh);
    disposables.push(ground, groundMaterial, groundMesh.geometry);

    // The raised squares, one instanced draw per terrain, and the trees.
    const byLetter = new Map<TerrainLetter, Square[]>();
    for (let square = 0; square < field.tiles.length; square++) {
        if (field.tiles[square].elevation === 0 && field.tiles[square].terrain.height === 0) continue;
        const letter = terrainLetter(field, square);
        if (letter === "_" || letter === ".") continue;
        byLetter.set(letter, [...byLetter.get(letter) ?? [], square]);
    }
    const matrix = new Matrix4();
    for (const [letter, squares] of byLetter) {
        const tree = letter === "T";
        const { side, top } = blockColours(sheets, letter);
        const geometry = tree ? treeGeometry(side) : coloured(new BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5), side, top);
        const material = solidMaterial();
        const mesh = new InstancedMesh(geometry, material, squares.length);
        squares.forEach((square, index) => {
            const col = square % field.width, row = Math.floor(square / field.width);
            const height = Math.max(field.tiles[square].elevation * QUARTER, 0.02);
            if (tree) {
                const ground = (field.tiles[square].elevation - field.tiles[square].terrain.height) * QUARTER;
                matrix.makeRotationY(variantOf(square, 7)).setPosition(col + 0.5, ground, row + 0.5);
            } else {
                matrix.makeScale(1, height, 1).setPosition(col, 0, row);
            }
            mesh.setMatrixAt(index, matrix);
        });
        group.add(mesh);
        solids.push(material);
        disposables.push(geometry, material);
    }

    const overlay = overlayPlane(field, 0.004);
    const wave = overlayPlane(field, 0.006, 0);
    group.add(overlay.mesh, wave.mesh);
    disposables.push(overlay.texture, overlay.material, overlay.mesh.geometry, wave.texture, wave.material, wave.mesh.geometry);

    return {
        group,
        solids,
        overlay: { data: overlay.data, texture: overlay.texture },
        wave: { data: wave.data, texture: wave.texture, material: wave.material },
        dispose: () => disposables.forEach(one => one.dispose()),
    };
}
