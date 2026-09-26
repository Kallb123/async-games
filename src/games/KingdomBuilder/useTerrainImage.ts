'use client'

// The v2 world art is the kit's pre-rendered tiles, shrunk to 64px a tile and
// packed into one sheet by `npm run kb-atlas` (scripts/kingdombuilder-atlas.mjs).
// The world is composed from that sheet once, back row first so each tile's
// trees and peaks overlap the row behind it, into a few horizontal bands (one
// canvas would be over iOS Safari's size limit), and the SVG is handed those
// rasters so panning, fog and the node/route layers stay in world coordinates.
//
// The kit pre-renders a tile for one terrain or a blend of two, and rivers only
// on grass. A world's corner grid is nudged to fit that (see
// `terrainCornerGrid`) rather than generating the rest in the browser, which
// took seconds on a phone.

import { useEffect, useMemo } from "react";

import { useResettingState } from "@/utils/hooks/useResettingState";
import ATLAS from "./terrainAtlas.json";
import { overlayCodesByTile, type OverlayPlacement } from "./worldgen/overlays";
import type { TerrainField } from "./worldgen/terrainField";

const ATLAS_HREF = "/art/kingdombuilder/v2/tiles.png";

export const TERRAIN_KEYS = ["sea", "lake", "coast", "grass", "wheat", "hills", "forest", "mountain"] as const;
export type TerrainKey = typeof TERRAIN_KEYS[number];
const GRASS = TERRAIN_KEYS.indexOf("grass");
const MOUNTAIN = TERRAIN_KEYS.indexOf("mountain");

/** Persisted game terrain translated to the closest member of the art kit. */
export const ART_TERRAIN_BY_CODE: Readonly<Record<string, TerrainKey>> = {
    o: "sea", l: "lake", b: "coast", g: "grass", f: "wheat",
    h: "hills", w: "forest", s: "forest", m: "mountain",
    // Rivers have dedicated overlay tiles on grass, rather than being one of
    // the kit's corner terrain values.
    r: "grass",
};

export interface TerrainImageWorld {
    terrainField?: TerrainField;
    overlays?: OverlayPlacement[];
}

/** One horizontal band of the drawn map. */
export interface TerrainStrip {
    href: string;
    /** Placement in world units, including the transparent overhang around its rows. */
    bounds: { x: number; y: number; width: number; height: number };
}

export interface TerrainImage {
    /** Top to bottom, in drawing order; empty until the map is drawn. */
    strips: TerrainStrip[];
}

/** A tile's ground footprint and the overhang padding around the ground grid, in sheet pixels. */
export interface TerrainTileDims {
    /** Ground footprint of one tile. */
    Wt: number;
    Ht: number;
    /** Padding left and right, above (for peaks and trees) and below. */
    PX: number;
    HR: number;
    BP: number;
}

let loggedFieldMismatch = false;
let loggedAtlasFailure = false;
let loggedMissingCell = false;

export function terrainFieldMatchesGrid(field: TerrainField): boolean {
    return field.codes.length === field.columns * field.rows;
}

export function overlaysKey(overlays: OverlayPlacement[] | undefined): string {
    return (overlays ?? []).map(overlay => `${overlay.tile}:${overlay.code}:${overlay.orientation ?? ""}`).join(",");
}

function codeAt(field: TerrainField, col: number, row: number): string {
    const x = Math.max(0, Math.min(field.columns - 1, col));
    const y = Math.max(0, Math.min(field.rows - 1, row));
    return field.codes[y * field.columns + x];
}

/** Whether an in-bounds cell holds a terrain code — the field's edge counts as neither. */
function codeIs(field: TerrainField, col: number, row: number, code: string): boolean {
    return col >= 0 && col < field.columns && row >= 0 && row < field.rows && field.codes[row * field.columns + col] === code;
}

/** Row-major indices into a corner grid of the tile's [TL, TR, BR, BL] corners. */
function cornerIndices(field: TerrainField, col: number, row: number): [number, number, number, number] {
    const width = field.columns + 1;
    const top = row * width + col;
    return [top, top + 1, top + width + 1, top + width];
}

/**
 * Which terrain a crowded tile gives up last, by kit index. Water and
 * mountains are the shapes a player reads the map by, so they hold; grass and
 * beach give way first — the kit paints its own sand edge wherever land meets
 * water, so a dropped beach corner costs little.
 */
const KEEP_PRIORITY = [7, 6, 1, 0, 2, 3, 4, 5];
const isWater = (value: number) => value <= TERRAIN_KEYS.indexOf("lake");

/**
 * Reduces one tile's corners to the two terrains the kit can blend: grass
 * first if a river has locked a corner to it, then the most common, then the
 * one that matters most on the map. A dropped corner takes a kept terrain of
 * its own kind where it can — water stays water and land stays land, so a
 * snap never fills a lake in or floods a field — and of those the nearest in
 * the kit's order (grass, wheat, hills, forest, mountain runs low to high
 * ground), so a mountain range doesn't creep over the grass beside it.
 */
export function snapCorners(corners: readonly number[], locked: readonly boolean[] = []): number[] {
    const counts = new Map<number, number>();
    corners.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
    if (counts.size <= 2) return [...corners];
    const ranked = [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!) || KEEP_PRIORITY[b] - KEEP_PRIORITY[a]);
    const kept = (locked.some(Boolean) ? [GRASS, ...ranked.filter(value => value !== GRASS)] : ranked).slice(0, 2);
    const replacement = (value: number) => {
        const sameKind = kept.filter(candidate => isWater(candidate) === isWater(value));
        return (sameKind.length > 0 ? sameKind : kept)
            .sort((a, b) => (Math.abs(a - value) - Math.abs(b - value)) || counts.get(b)! - counts.get(a)!)[0];
    };
    return corners.map((value, index) => kept.includes(value) || locked[index] ? value : replacement(value));
}

const RELAX_PASSES = 8;

/**
 * Every tile corner's art terrain, as a (columns+1)x(rows+1) row-major grid.
 * Each corner takes the cell down/right of it, so every shared corner has one
 * value. It is then fitted to the tiles the kit pre-renders: every corner of a
 * river tile becomes grass (the only ground the river tiles are drawn on), and
 * any tile left with three or four terrains is snapped to two. Corners are
 * shared, so a change here carries into the neighbours and the map stays
 * seamless; a few passes settle what one snap unsettles next door.
 */
export function terrainCornerGrid(field: TerrainField): Uint8Array {
    const width = field.columns + 1;
    const grid = new Uint8Array(width * (field.rows + 1));
    for (let y = 0; y <= field.rows; y++) {
        for (let x = 0; x < width; x++) grid[y * width + x] = TERRAIN_KEYS.indexOf(ART_TERRAIN_BY_CODE[codeAt(field, x, y)] ?? "grass");
    }
    const locked = new Uint8Array(grid.length);
    for (let tile = 0; tile < field.codes.length; tile++) {
        if (field.codes[tile] !== "r") continue;
        for (const corner of cornerIndices(field, tile % field.columns, Math.floor(tile / field.columns))) {
            grid[corner] = GRASS;
            locked[corner] = 1;
        }
    }
    for (let pass = 0; pass < RELAX_PASSES; pass++) {
        let changed = false;
        for (let row = 0; row < field.rows; row++) {
            for (let col = 0; col < field.columns; col++) {
                const corners = cornerIndices(field, col, row);
                const snapped = snapCorners(corners.map(corner => grid[corner]), corners.map(corner => locked[corner] === 1));
                corners.forEach((corner, index) => {
                    if (grid[corner] !== snapped[index]) { grid[corner] = snapped[index]; changed = true; }
                });
            }
        }
        if (!changed) break;
    }
    return grid;
}

/** Kit bit order is N=8, E=4, S=2, W=1. */
export function riverMask(field: TerrainField, col: number, row: number): number {
    const river = (x: number, y: number) => codeIs(field, x, y, "r");
    return (river(col, row - 1) ? 8 : 0) | (river(col + 1, row) ? 4 : 0) | (river(col, row + 1) ? 2 : 0) | (river(col - 1, row) ? 1 : 0);
}

export interface TerrainTileSpec {
    corners: readonly [number, number, number, number];
    variant: number;
    river: number;
    bridge: boolean;
    summit: boolean;
}

/** Everything that picks one square's tile, derived without touching the DOM so it stays testable. */
export function terrainTileSpec(field: TerrainField, grid: Uint8Array, overlayByTile: ReadonlyMap<number, string>, col: number, row: number): TerrainTileSpec {
    const tile = row * field.columns + col;
    const river = field.codes[tile] === "r" ? riverMask(field, col, row) : 0;
    const isMountain = (x: number, y: number) => codeIs(field, x, y, "m");
    return {
        corners: cornerIndices(field, col, row).map(corner => grid[corner]) as [number, number, number, number],
        variant: Math.abs(Math.imul(col, 374761393) ^ Math.imul(row, 668265263)) % 3,
        river,
        bridge: overlayByTile.get(tile) === "B" && (river === 5 || river === 10),
        summit: field.codes[tile] === "m" && isMountain(col, row - 1) && isMountain(col + 1, row)
            && isMountain(col, row + 1) && isMountain(col - 1, row),
    };
}

const twoDigits = (value: number) => String(value).padStart(2, "0");

/** The sheet cell for a tile: its master's path under art-masters/kingdombuilder/v2/tiles. */
export function atlasCellName(spec: TerrainTileSpec): string {
    if (spec.river) return `river/grass_river_${twoDigits(spec.river)}${spec.bridge ? "_bridge" : ""}`;
    // A tile the corner grid couldn't settle is snapped on its own: one seam beats a hole.
    const corners = snapCorners(spec.corners);
    const [low, high] = [...new Set(corners)].sort((a, b) => a - b);
    if (high === undefined) return spec.summit && low === MOUNTAIN ? "base/mountain_summit" : `base/${TERRAIN_KEYS[low]}_v${spec.variant}`;
    // Kit blend index: TL=8, TR=4, BR=2, BL=1, set where the corner is the higher-drawn terrain.
    const mask = corners.reduce((bits, value, index) => bits | (value === high ? 8 >> index : 0), 0);
    return `blend/${TERRAIN_KEYS[low]}__${TERRAIN_KEYS[high]}/${twoDigits(mask)}`;
}

const CELL_INDEX = new Map(ATLAS.cells.map((name, index) => [name, index]));

let atlasPromise: Promise<HTMLImageElement | null> | null = null;

function loadAtlas(): Promise<HTMLImageElement | null> {
    if (!atlasPromise) {
        const image = new Image();
        image.src = ATLAS_HREF;
        atlasPromise = image.decode().then(() => image, () => {
            if (!loggedAtlasFailure) {
                loggedAtlasFailure = true;
                console.warn("Kingdom Builder: terrain tile sheet failed to load.");
            }
            atlasPromise = null;
            return null;
        });
    }
    return atlasPromise;
}

/**
 * iOS Safari refuses any canvas over 16.7M pixels, and a 100x70 world at 64px a
 * tile is twice that, so the map is drawn as bands of whole tile rows, each on
 * a canvas of at most half the limit.
 */
export const MAX_STRIP_PIXELS = 8_000_000;

/** A band's rows: `count` of them from `first`. */
export interface StripRows {
    first: number;
    count: number;
}

/**
 * How many rows a band draws: its own, plus the next one down. Two images'
 * ground edges meeting would each come out part-transparent as the browser
 * scales them, a hairline of board showing through; the extra row puts an
 * opaque copy under the next band's top edge instead.
 */
const drawnRows = (field: TerrainField, strip: StripRows) => Math.min(strip.count + 1, field.rows - strip.first);

/** A canvas's size in pixels for `rows` rows of ground plus the overhang padding around them. */
function stripSize(field: TerrainField, rows: number, dims: TerrainTileDims): { width: number; height: number } {
    return { width: field.columns * dims.Wt + 2 * dims.PX, height: rows * dims.Ht + dims.HR + dims.BP };
}

/** The canvas one band is drawn on, in pixels. */
export function terrainStripSize(field: TerrainField, strip: StripRows, dims: TerrainTileDims = ATLAS.dims): { width: number; height: number } {
    return stripSize(field, drawnRows(field, strip), dims);
}

/** Splits the map into bands of whole rows, as even as they come, each under the canvas budget. */
export function terrainStripRows(field: TerrainField, dims: TerrainTileDims = ATLAS.dims, maxPixels = MAX_STRIP_PIXELS): StripRows[] {
    const { width } = stripSize(field, 0, dims);
    // One row of each band's budget goes to the copy it draws of the next band's first row.
    const fits = Math.max(1, Math.floor((maxPixels / width - dims.HR - dims.BP) / dims.Ht) - 1);
    const bands = Math.ceil(field.rows / fits);
    const perBand = Math.ceil(field.rows / bands);
    const strips: StripRows[] = [];
    for (let first = 0; first < field.rows; first += perBand) strips.push({ first, count: Math.min(perBand, field.rows - first) });
    return strips;
}

/** Where a band's raster sits in world units, so its ground lines up with the terrain field. */
export function terrainStripBounds(field: TerrainField, strip: StripRows, dims: TerrainTileDims = ATLAS.dims): TerrainStrip["bounds"] {
    const scaleX = field.tileSize / dims.Wt;
    const scaleY = field.tileSize / dims.Ht;
    const { width, height } = terrainStripSize(field, strip, dims);
    return { x: -dims.PX * scaleX, y: (strip.first * dims.Ht - dims.HR) * scaleY, width: width * scaleX, height: height * scaleY };
}

/** Draws one band from the sheet, back row first so each tile's trees and peaks overlap the row behind it. */
function drawStrip(atlas: HTMLImageElement, field: TerrainField, grid: Uint8Array, overlayByTile: ReadonlyMap<number, string>, strip: StripRows): HTMLCanvasElement | null {
    const { dims, cell, columns } = ATLAS;
    const canvas = document.createElement("canvas");
    Object.assign(canvas, terrainStripSize(field, strip, dims));
    const context = canvas.getContext("2d");
    if (!context) return null;
    const lastRow = strip.first + drawnRows(field, strip);
    for (let row = strip.first; row < lastRow; row++) {
        for (let col = 0; col < field.columns; col++) {
            const name = atlasCellName(terrainTileSpec(field, grid, overlayByTile, col, row));
            const index = CELL_INDEX.get(name);
            if (index === undefined) {
                if (!loggedMissingCell) {
                    loggedMissingCell = true;
                    console.warn(`Kingdom Builder: no terrain tile "${name}" in the sheet.`);
                }
                continue;
            }
            context.drawImage(atlas, (index % columns) * cell.width, Math.floor(index / columns) * cell.height, cell.width, cell.height,
                col * dims.Wt, (row - strip.first) * dims.Ht, cell.width, cell.height);
        }
    }
    return canvas;
}

/** A canvas's PNG, releasing the canvas's own pixels as soon as the copy is taken. */
function takeBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(blob => {
        canvas.width = canvas.height = 0;
        resolve(blob);
    }));
}

/** Every band of the map as an image, drawn one at a time so only one band's canvas is ever alive. */
async function compositeTerrain(field: TerrainField, overlays: readonly OverlayPlacement[]): Promise<{ blob: Blob; strip: StripRows }[] | null> {
    if (!terrainFieldMatchesGrid(field)) {
        if (!loggedFieldMismatch) {
            loggedFieldMismatch = true;
            console.warn("Kingdom Builder: terrain field length disagrees with its grid — drawing no ground layer.");
        }
        return null;
    }

    const atlas = await loadAtlas();
    if (!atlas) return null;
    const grid = terrainCornerGrid(field);
    const overlayByTile = overlayCodesByTile(overlays);
    const drawn: { blob: Blob; strip: StripRows }[] = [];
    for (const strip of terrainStripRows(field)) {
        const canvas = drawStrip(atlas, field, grid, overlayByTile, strip);
        const blob = canvas && await takeBlob(canvas);
        if (!blob) return null;
        drawn.push({ blob, strip });
    }
    return drawn;
}

export function useTerrainImage(world: TerrainImageWorld): TerrainImage {
    const field = world.terrainField;
    const fieldKey = field ? `${field.columns}x${field.rows}@${field.tileSize}:${field.codes}` : "";
    const overlayKey = useMemo(() => overlaysKey(world.overlays), [world.overlays]);
    const [strips, setStrips] = useResettingState<TerrainStrip[]>([], `${fieldKey}::${overlayKey}`);

    useEffect(() => {
        if (!field) return;
        let cancelled = false;
        const objectUrls: string[] = [];
        compositeTerrain(field, world.overlays ?? []).then(drawn => {
            if (cancelled || !drawn) return;
            setStrips(drawn.map(({ blob, strip }) => {
                const href = URL.createObjectURL(blob);
                objectUrls.push(href);
                return { href, bounds: terrainStripBounds(field, strip) };
            }));
        });
        return () => {
            cancelled = true;
            objectUrls.forEach(url => URL.revokeObjectURL(url));
        };
        // Stable content keys prevent polling from recompositing equal data.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldKey, overlayKey]);

    return { strips };
}
