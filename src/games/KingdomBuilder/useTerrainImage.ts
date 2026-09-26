'use client'

// The v2 world art is the kit's pre-rendered tiles, shrunk to 32px a tile and
// packed into one sheet by `npm run kb-atlas` (scripts/kingdombuilder-atlas.mjs).
// The world is composed from that sheet once, back row first so each tile's
// trees and peaks overlap the row behind it, and the SVG is handed one raster
// so panning, fog and the node/route layers stay in world coordinates.
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

export interface TerrainImage {
    href: string | null;
    /** Placement includes the transparent overhang around the ground grid. */
    bounds?: { x: number; y: number; width: number; height: number };
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

async function compositeTerrain(field: TerrainField, overlays: readonly OverlayPlacement[]): Promise<HTMLCanvasElement | null> {
    if (!terrainFieldMatchesGrid(field)) {
        if (!loggedFieldMismatch) {
            loggedFieldMismatch = true;
            console.warn("Kingdom Builder: terrain field length disagrees with its grid — drawing no ground layer.");
        }
        return null;
    }

    const atlas = await loadAtlas();
    if (!atlas) return null;
    const { dims, cell, columns } = ATLAS;
    const canvas = document.createElement("canvas");
    Object.assign(canvas, rasterSize(field, dims));
    const context = canvas.getContext("2d");
    if (!context) return null;

    const grid = terrainCornerGrid(field);
    const overlayByTile = overlayCodesByTile(overlays);
    for (let row = 0; row < field.rows; row++) {
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
                col * dims.Wt, row * dims.Ht, cell.width, cell.height);
        }
    }
    return canvas;
}

/** The composed map's size in pixels: the ground grid plus the overhang padding around it. */
function rasterSize(field: TerrainField, dims: TerrainTileDims): { width: number; height: number } {
    return { width: field.columns * dims.Wt + 2 * dims.PX, height: field.rows * dims.Ht + dims.HR + dims.BP };
}

/** Where the padded raster sits in world units, so its ground grid lines up with the terrain field. */
export function terrainImageBounds(field: TerrainField, dims: TerrainTileDims = ATLAS.dims): NonNullable<TerrainImage["bounds"]> {
    const scaleX = field.tileSize / dims.Wt;
    const scaleY = field.tileSize / dims.Ht;
    const { width, height } = rasterSize(field, dims);
    return { x: -dims.PX * scaleX, y: -dims.HR * scaleY, width: width * scaleX, height: height * scaleY };
}

export function useTerrainImage(world: TerrainImageWorld): TerrainImage {
    const field = world.terrainField;
    const fieldKey = field ? `${field.columns}x${field.rows}@${field.tileSize}:${field.codes}` : "";
    const overlayKey = useMemo(() => overlaysKey(world.overlays), [world.overlays]);
    const [href, setHref] = useResettingState<string | null>(null, `${fieldKey}::${overlayKey}`);

    useEffect(() => {
        if (!field) return;
        let cancelled = false;
        let objectUrl: string | null = null;
        compositeTerrain(field, world.overlays ?? []).then(canvas => {
            if (cancelled || !canvas) return;
            canvas.toBlob(blob => {
                // The blob is a copy; release the raster's pixels straight away.
                canvas.width = canvas.height = 0;
                if (cancelled || !blob) return;
                objectUrl = URL.createObjectURL(blob);
                setHref(objectUrl);
            });
        });
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
        // Stable content keys prevent polling from recompositing equal data.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldKey, overlayKey]);

    return { href, ...(field ? { bounds: terrainImageBounds(field) } : {}) };
}
