'use client'

// The v2 world art is a text-only canvas generator rather than a conventional
// sprite sheet. It composes the ground first and overhanging mountains and
// trees second, once per world, then gives the SVG one raster so panning, fog
// and the node/route layers stay in the world-coordinate system they use.

import { useEffect, useMemo } from "react";

import { useResettingState } from "@/utils/hooks/useResettingState";
import { overlayCodesByTile, type OverlayPlacement } from "./worldgen/overlays";
import type { TerrainField } from "./worldgen/terrainField";

const ART_ROOT = "/art/kingdombuilder/v2";
const TILE_WIDTH = 160;
const TILE_HEIGHT = 113;
const PAD_X = 29;
const GROUND_Y = 107;
const PAD_BOTTOM = 14;

export const TERRAIN_KEYS = ["sea", "lake", "coast", "grass", "wheat", "hills", "forest", "mountain"] as const;
export type TerrainKey = typeof TERRAIN_KEYS[number];

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

let loggedFieldMismatch = false;
let loggedTileLoadFailure = false;

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

/**
 * The art joins on corner values, not on a square's own terrain. Taking each
 * corner from the cell down/right of it gives every shared corner one stable
 * value while retaining every generated terrain cell in the picture.
 */
export function terrainCorners(field: TerrainField, col: number, row: number): readonly [TerrainKey, TerrainKey, TerrainKey, TerrainKey] {
    const terrainAt = (x: number, y: number) => ART_TERRAIN_BY_CODE[codeAt(field, x, y)] ?? "grass";
    return [terrainAt(col, row), terrainAt(col + 1, row), terrainAt(col + 1, row + 1), terrainAt(col, row + 1)];
}

/** Kit bit order is N=8, E=4, S=2, W=1. */
export function riverMask(field: TerrainField, col: number, row: number): number {
    const river = (x: number, y: number) => x >= 0 && x < field.columns && y >= 0 && y < field.rows && codeAt(field, x, y) === "r";
    return (river(col, row - 1) ? 8 : 0) | (river(col + 1, row) ? 4 : 0) | (river(col, row + 1) ? 2 : 0) | (river(col - 1, row) ? 1 : 0);
}

export interface TerrainTileSpec {
    corners: readonly [number, number, number, number];
    variant: number;
    river: number;
    bridge: boolean;
    summit: boolean;
}

/** Everything the source kit needs to paint one square, derived without touching the DOM so it stays testable. */
export function terrainTileSpec(field: TerrainField, overlayByTile: ReadonlyMap<number, string>, col: number, row: number): TerrainTileSpec {
    const tile = row * field.columns + col;
    const river = field.codes[tile] === "r" ? riverMask(field, col, row) : 0;
    const isMountain = (x: number, y: number) => x >= 0 && x < field.columns && y >= 0 && y < field.rows && codeAt(field, x, y) === "m";
    return {
        corners: terrainCorners(field, col, row).map(value => TERRAIN_KEYS.indexOf(value)) as [number, number, number, number],
        variant: Math.abs(Math.imul(col, 374761393) ^ Math.imul(row, 668265263)) % 3,
        river,
        bridge: overlayByTile.get(tile) === "B" && (river === 5 || river === 10),
        summit: field.codes[tile] === "m" && isMountain(col, row - 1) && isMountain(col + 1, row)
            && isMountain(col, row + 1) && isMountain(col - 1, row),
    };
}

interface TerrainTilesApi {
    compose(
        resolution: number,
        columns: number,
        rows: number,
        tileAt: (col: number, row: number) => readonly [readonly number[], number, number, boolean, boolean],
        options: { grid: boolean },
    ): { canvas: HTMLCanvasElement };
}

declare global {
    interface Window { TerrainTiles?: TerrainTilesApi }
}

let kitPromise: Promise<TerrainTilesApi | null> | null = null;

/** Loads the text-only source generator once. This replaces hundreds of generated binary tiles in the deploy. */
function loadTerrainKit(): Promise<TerrainTilesApi | null> {
    if (window.TerrainTiles) return Promise.resolve(window.TerrainTiles);
    if (!kitPromise) kitPromise = new Promise(resolve => {
        const script = document.createElement("script");
        script.src = `${ART_ROOT}/terrain-tiles.js`;
        script.onload = () => resolve(window.TerrainTiles ?? null);
        script.onerror = () => {
            if (!loggedTileLoadFailure) {
                loggedTileLoadFailure = true;
                console.warn("Kingdom Builder: terrain generator failed to load.");
            }
            resolve(null);
        };
        document.head.appendChild(script);
    });
    return kitPromise;
}

async function compositeTerrain(field: TerrainField, overlays: readonly OverlayPlacement[]): Promise<HTMLCanvasElement | null> {
    if (!terrainFieldMatchesGrid(field)) {
        if (!loggedFieldMismatch) {
            loggedFieldMismatch = true;
            console.warn("Kingdom Builder: terrain field length disagrees with its grid — drawing no ground layer.");
        }
        return null;
    }

    const kit = await loadTerrainKit();
    if (!kit) return null;
    const overlayByTile = overlayCodesByTile(overlays);

    return kit.compose(128, field.columns, field.rows, (col, row) => {
        const spec = terrainTileSpec(field, overlayByTile, col, row);
        return [spec.corners, spec.variant, spec.river, spec.summit, spec.bridge];
    }, { grid: false }).canvas;
}

export function terrainImageBounds(field: TerrainField): NonNullable<TerrainImage["bounds"]> {
    const scaleX = field.tileSize / TILE_WIDTH;
    const scaleY = field.tileSize / TILE_HEIGHT;
    return {
        x: -PAD_X * scaleX,
        y: -GROUND_Y * scaleY,
        width: (field.columns * TILE_WIDTH + 2 * PAD_X) * scaleX,
        height: (field.rows * TILE_HEIGHT + GROUND_Y + PAD_BOTTOM) * scaleY,
    };
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
