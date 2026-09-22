'use client'

// Rendering beneath the node graph (GDD §3.5.6): composites the generated
// ground into one offscreen canvas, once per world, and hands back an object
// URL the map draws as a single `<image>` — the same single-raster board
// World Domination and Outbreak already draw. `MapEdges`, the node graph and
// `MapLabelLayer` are untouched; the tiles just go underneath them.
//
// Three passes, in order (§3.5.6): every area's fill, then every area's
// border-overlay tiles, then the sparse overlay list. PR 10 shipped with no
// sheet at all, so only the fill pass ever drew anything — the fallback
// colour every registry entry declares. PR 11 adds the first sheet and the
// other two passes: an area on a mask layout recomputes, per tile, which of
// its art tiles its own neighbour mask picks (§3.5.5's autotiling), and a
// `variants`/`single` area or overlay draws straight from the sheet. An area
// or overlay with no art yet, or whose sheet failed to load, is left on the
// fallback fill from pass one — never a coloured square standing in for a
// picture, and never a throw inside a board.

import { useEffect, useMemo } from "react";

import { useResettingState } from "@/utils/hooks/useResettingState";
import { AREAS, areaForCode } from "./worldgen/areas";
import { overlayForCode, type OverlayPlacement } from "./worldgen/overlays";
import type { TerrainField } from "./worldgen/terrainField";
import { AREA_ART, blobIndexOf, isMaskArt, NEIGHBOUR_BITS, OVERLAY_ART, sheetColumns, sheetSourceRect, sheetTilePixels, tilePieceParts, tileRefsOf, TILESET, type MaskLayout, type TileArt, type TileRef, type TilesetManifest } from "./tileset";

export interface TerrainImageWorld {
    terrainField?: TerrainField;
    overlays?: OverlayPlacement[];
}

export interface TerrainImage {
    /**
     * An object URL for the composited ground, in the same world-unit space
     * as the field's grid. Null for a world with no terrain field (drawn
     * before this landed) or a canvas the browser refused — the map screen
     * keeps drawing today's flat silhouette in either case (§3.5.6).
     */
    href: string | null;
}

let loggedFieldMismatch = false;

/** A field whose length disagrees with its own declared grid — a corrupt or partial document — is drawn as no ground layer at all, never thrown over (a board draws the fallback, it never throws). Exported for testing without a DOM. */
export function terrainFieldMatchesGrid(field: TerrainField): boolean {
    return field.codes.length === field.columns * field.rows;
}

/** Overlays are generated once and stored, never recomputed per render (§3.5.3), so a stable key of their content — not the array reference a poll hands back afresh — keeps an unchanged world from recompositing (and re-leaking an object URL) on every refetch. Exported for testing without a DOM. */
export function overlaysKey(overlays: OverlayPlacement[] | undefined): string {
    return (overlays ?? []).map(overlay => `${overlay.tile}:${overlay.code}:${overlay.orientation ?? ""}`).join(",");
}

/**
 * A tile's own 4-bit neighbour mask (§3.5.5): bit 0 north, bit 1 east, bit 2
 * south, bit 3 west, set when that neighbour carries the *same* code as this
 * tile. Off the edge of the grid is never a match, so the map's own border
 * always autotiles as a border rather than assuming open ground beyond it.
 * Compares raw codes rather than resolved areas, so two tiles of an unknown
 * code still autotile consistently with each other. Exported for testing
 * without a DOM.
 */
export function neighbourMask(field: TerrainField, col: number, row: number): number {
    return sideMask(sameCodeAs(field, field.codes[row * field.columns + col]), col, row);
}

/**
 * "Is the square at (c, r) the same thing as the one being drawn?" — the one
 * question every mask asks, and the only thing that differs between an area
 * masking against the terrain field and a self-connecting overlay masking
 * against the sparse placement list. Off the edge of the grid is never a
 * match, so the map's own border always autotiles as a border rather than
 * assuming open ground beyond it.
 */
type NeighbourMatcher = (col: number, row: number) => boolean;

/** Matches a square of the terrain field carrying the given raw code. Compares raw codes rather than resolved areas, so two tiles of an unknown code still autotile consistently with each other. */
function sameCodeAs(field: TerrainField, code: string): NeighbourMatcher {
    return (col, row) => col >= 0 && col < field.columns && row >= 0 && row < field.rows && field.codes[row * field.columns + col] === code;
}

/** Matches a square carrying the given overlay code, from the sparse placement list indexed by tile. A square with no overlay on it matches nothing, so a lone bridge still autotiles as a lone bridge. */
function sameOverlayAs(field: TerrainField, overlayByTile: ReadonlyMap<number, string>, code: string): NeighbourMatcher {
    return (col, row) => col >= 0 && col < field.columns && row >= 0 && row < field.rows && overlayByTile.get(row * field.columns + col) === code;
}

function sideMask(matches: NeighbourMatcher, col: number, row: number): number {
    let mask = 0;
    if (matches(col, row - 1)) mask |= 1;
    if (matches(col + 1, row)) mask |= 2;
    if (matches(col, row + 1)) mask |= 4;
    if (matches(col - 1, row)) mask |= 8;
    return mask;
}

/**
 * A tile's own 8-bit neighbour mask, for `mask47` (§3.5.5): the four sides of
 * `neighbourMask` plus the four diagonals, so an area can tell an inner corner
 * — two arms closing around one square of something else — from the plain
 * interior tile a 4-bit mask collapses it onto. Same rules otherwise: a match
 * is the *same* raw code, and off the edge of the grid never matches.
 * Exported for testing without a DOM.
 */
export function neighbourMask8(field: TerrainField, col: number, row: number): number {
    return eightMask(sameCodeAs(field, field.codes[row * field.columns + col]), col, row);
}

function eightMask(matches: NeighbourMatcher, col: number, row: number): number {
    let mask = 0;
    if (matches(col, row - 1)) mask |= NEIGHBOUR_BITS.north;
    if (matches(col + 1, row - 1)) mask |= NEIGHBOUR_BITS.northEast;
    if (matches(col + 1, row)) mask |= NEIGHBOUR_BITS.east;
    if (matches(col + 1, row + 1)) mask |= NEIGHBOUR_BITS.southEast;
    if (matches(col, row + 1)) mask |= NEIGHBOUR_BITS.south;
    if (matches(col - 1, row + 1)) mask |= NEIGHBOUR_BITS.southWest;
    if (matches(col - 1, row)) mask |= NEIGHBOUR_BITS.west;
    if (matches(col - 1, row - 1)) mask |= NEIGHBOUR_BITS.northWest;
    return mask;
}

/**
 * A deterministic pick in `[0, count)` from a tile's own coordinates — no
 * `Math.random`, so a `variants` area's texture is stable across renders and
 * identical for every player looking at the same world. Exported for testing
 * without a DOM.
 */
export function seededVariantIndex(col: number, row: number, count: number): number {
    if (count <= 0) return 0;
    const h = Math.imul(col, 374761393) ^ Math.imul(row, 668265263);
    const mixed = Math.imul(h ^ (h >>> 13), 1274126177);
    return Math.abs(mixed ^ (mixed >>> 16)) % count;
}

/**
 * The tile a mask layout draws for one square of map: the 4-bit mask straight
 * into a `mask16`'s sixteen, or the 8-bit mask through `blobIndexOf` into a
 * `mask47`'s forty-seven. Falls back to the entry's last tile if a caller ever
 * hands it a short array — the guard test is what actually keeps the shipped
 * manifest's arrays the right length.
 */
function maskSlot(layout: MaskLayout, matches: NeighbourMatcher, col: number, row: number): number {
    return layout === "mask16" ? sideMask(matches, col, row) : blobIndexOf(eightMask(matches, col, row));
}

function maskTile(art: Extract<TileArt, { layout: MaskLayout }>, slot: number): TileRef | undefined {
    return art.tiles[slot] ?? art.tiles[art.tiles.length - 1];
}

/**
 * The sparse overlay list indexed by tile, for masking a self-connecting
 * overlay against its neighbours. Two placements on one tile is a
 * generated-world bug rather than something to draw twice over: the last one
 * in wins the square's identity, and both still draw. Exported for testing
 * without a DOM.
 */
export function overlayCodesByTile(overlays: readonly OverlayPlacement[]): Map<number, string> {
    return new Map(overlays.map(placement => [placement.tile, placement.code]));
}

/**
 * Which slot of a self-connecting overlay's mask art one placement draws — a
 * road, a wall, a fence, masking against the other overlays around it rather
 * than against the ground under it, which is what makes a road read as its own
 * run and not as the grass it crosses. A square carrying no overlay matches
 * nothing, so a lone bridge autotiles as a lone bridge; off the edge of the
 * grid never matches, same as an area's. Exported for testing without a DOM.
 */
export function overlayMaskSlot(layout: MaskLayout, field: TerrainField, overlayByTile: ReadonlyMap<number, string>, tile: number): number {
    const code = overlayByTile.get(tile);
    if (code === undefined) return 0;
    return maskSlot(layout, sameOverlayAs(field, overlayByTile, code), tile % field.columns, Math.floor(tile / field.columns));
}

/** Every tile a `variants`/`single`/mask art entry could ever point at, for preloading every sheet a composite might need before drawing starts. */
function sheetNamesUsed(artMaps: ReadonlyArray<Readonly<Record<string, TileArt>>>): Set<string> {
    const names = new Set<string>();
    for (const map of artMaps) for (const art of Object.values(map)) for (const ref of tileRefsOf(art)) names.add(ref.sheet);
    return names;
}

const sheetImageCache = new Map<string, Promise<HTMLImageElement | null>>();
let loggedSheetLoadFailure = false;

/** Loads (and caches) a sheet's own image element. Never rejects — a sheet that 404s or fails to decode resolves to `null`, which every caller treats as "draw the fallback instead", not a thrown error inside a board (§3.5.6). */
function loadSheetImage(sheetPath: string): Promise<HTMLImageElement | null> {
    let cached = sheetImageCache.get(sheetPath);
    if (!cached) {
        cached = new Promise<HTMLImageElement | null>(resolve => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => {
                if (!loggedSheetLoadFailure) {
                    loggedSheetLoadFailure = true;
                    console.warn(`Kingdom Builder: tile sheet "${sheetPath}" failed to load — drawing fallback colours for it.`);
                }
                resolve(null);
            };
            image.src = sheetPath;
        });
        sheetImageCache.set(sheetPath, cached);
    }
    return cached;
}

async function loadSheetImages(manifest: TilesetManifest, needed: Set<string>): Promise<Map<string, HTMLImageElement>> {
    const entries = await Promise.all(
        [...needed].map(async name => {
            const sheet = manifest.sheets[name];
            const image = sheet ? await loadSheetImage(sheet.path) : null;
            return [name, image] as const;
        }),
    );
    const images = new Map<string, HTMLImageElement>();
    for (const [name, image] of entries) if (image) images.set(name, image);
    return images;
}

/**
 * Draws one ref's art at the map square it was placed on, straight from the
 * loaded sheet image — a no-op if that sheet never loaded. A multi-square
 * piece is blitted a square at a time, each one offset from the placement by
 * `tilePieceParts` (which has already applied the piece's anchor), so a sheet
 * with a gutter between its squares doesn't drag that gutter into the picture.
 */
function drawTile(context: CanvasRenderingContext2D, manifest: TilesetManifest, images: ReadonlyMap<string, HTMLImageElement>, ref: TileRef, col: number, row: number, tilePixels: number): void {
    const sheet = manifest.sheets[ref.sheet];
    const image = images.get(ref.sheet);
    if (!sheet || !image) return;
    const columns = Math.max(1, sheetColumns(sheet, image.naturalWidth));
    for (const part of tilePieceParts(ref, columns)) {
        const { sx, sy, sw, sh } = sheetSourceRect(sheet, image.naturalWidth, part.index);
        context.drawImage(image, sx, sy, sw, sh, (col + part.offsetX) * tilePixels, (row + part.offsetY) * tilePixels, tilePixels, tilePixels);
    }
}

/** Pass one (§3.5.6): every tile's registry fallback colour, then a `variants`/`single` area's own picked tile on top where its sheet loaded. Areas on a mask layout are deliberately left on the fallback here — their real look is pass two's, once every tile's neighbours are known. */
function paintFill(context: CanvasRenderingContext2D, field: TerrainField, tilePixels: number, manifest: TilesetManifest, images: ReadonlyMap<string, HTMLImageElement>): void {
    for (let row = 0; row < field.rows; row++) {
        for (let col = 0; col < field.columns; col++) {
            const area = areaForCode(field.codes[row * field.columns + col]);
            context.fillStyle = area.fallbackColour;
            context.fillRect(col * tilePixels, row * tilePixels, tilePixels, tilePixels);

            const art = AREA_ART[area.code];
            // `orientation` describes an overlay's own direction (a bridge's
            // crossing), not anything an area has — nothing declares one for
            // an area, and this pass wouldn't know what to pick if it did.
            if (!art || isMaskArt(art) || art.layout === "orientation") continue;
            const ref = art.layout === "single" ? art.tile : art.tiles[seededVariantIndex(col, row, art.tiles.length)];
            if (ref) drawTile(context, manifest, images, ref, col, row, tilePixels);
        }
    }
}

/** Pass two (§3.5.6): every area on a mask layout redraws its own tiles, in the registry's priority order, picking each one's real neighbour-mask variant — the four sides for a `mask16`, all eight neighbours for a `mask47`. A no-op for a tile whose area has no mask entry or whose sheet never loaded — pass one's fallback (or its `variants`/`single` art) stands as its finished look. */
function paintMaskBorders(context: CanvasRenderingContext2D, field: TerrainField, tilePixels: number, manifest: TilesetManifest, images: ReadonlyMap<string, HTMLImageElement>): void {
    for (const area of AREAS) {
        const art = AREA_ART[area.code];
        if (!art || !isMaskArt(art)) continue;
        for (let row = 0; row < field.rows; row++) {
            for (let col = 0; col < field.columns; col++) {
                if (field.codes[row * field.columns + col] !== area.code) continue;
                const ref = maskTile(art, maskSlot(art.layout, sameCodeAs(field, area.code), col, row));
                if (ref) drawTile(context, manifest, images, ref, col, row, tilePixels);
            }
        }
    }
}

/** Pass three (§3.5.6): the sparse overlay list. An overlay with no `OVERLAY_ART` entry, or whose code the registry no longer recognises, or whose sheet failed to load, draws nothing — a missing bridge reads as "not drawn yet", never a coloured square standing in for one. */
function paintOverlays(context: CanvasRenderingContext2D, field: TerrainField, overlays: readonly OverlayPlacement[], tilePixels: number, manifest: TilesetManifest, images: ReadonlyMap<string, HTMLImageElement>): void {
    // Indexed once here rather than scanned per neighbour per square.
    const overlayByTile = overlayCodesByTile(overlays);

    for (const placement of overlays) {
        if (placement.tile < 0 || placement.tile >= field.columns * field.rows) continue;
        if (!overlayForCode(placement.code)) continue;
        const art = OVERLAY_ART[placement.code];
        if (!art) continue;

        const col = placement.tile % field.columns, row = Math.floor(placement.tile / field.columns);
        const ref =
            art.layout === "single" ? art.tile :
            art.layout === "orientation" ? (placement.orientation ? art.tiles[placement.orientation] : undefined) ?? Object.values(art.tiles)[0] :
            art.layout === "variants" ? art.tiles[seededVariantIndex(col, row, art.tiles.length)] :
            maskTile(art, overlayMaskSlot(art.layout, field, overlayByTile, placement.tile)); // a self-connecting overlay autotiles against its own kind exactly as an area does against its own.
        if (!ref) continue;
        drawTile(context, manifest, images, ref, col, row, tilePixels);
    }
}

async function compositeTerrain(field: TerrainField, overlays: readonly OverlayPlacement[]): Promise<HTMLCanvasElement | null> {
    if (!terrainFieldMatchesGrid(field)) {
        if (!loggedFieldMismatch) {
            loggedFieldMismatch = true;
            console.warn("Kingdom Builder: terrain field length disagrees with its grid — drawing no ground layer.");
        }
        return null;
    }

    const manifest = TILESET;
    const images = await loadSheetImages(manifest, sheetNamesUsed([AREA_ART, OVERLAY_ART]));

    const tilePixels = sheetTilePixels();
    const canvas = document.createElement("canvas");
    canvas.width = field.columns * tilePixels;
    canvas.height = field.rows * tilePixels;
    const context = canvas.getContext("2d");
    if (!context) return null;
    // The art is pixel art, and a sheet drawn at anything but its own pixel
    // size goes through this — `sheetTilePixels()` is the *largest* declared
    // tile size, so the day a 32px sheet lands beside a 16px one, the 16px art
    // is upscaled. Left smoothed, that upscale is a bilinear blur, which is
    // the one thing pixel art must never be put through.
    context.imageSmoothingEnabled = false;

    paintFill(context, field, tilePixels, manifest, images);
    paintMaskBorders(context, field, tilePixels, manifest, images);
    paintOverlays(context, field, overlays, tilePixels, manifest, images);
    return canvas;
}

export function useTerrainImage(world: TerrainImageWorld): TerrainImage {
    const field = world.terrainField;
    const fieldKey = field ? `${field.columns}x${field.rows}@${field.tileSize}:${field.codes}` : "";
    const overlayKey = useMemo(() => overlaysKey(world.overlays), [world.overlays]);
    // A plain `useEffect(() => setHref(...), [key])` is a synchronous setState
    // inside an effect (react-hooks/set-state-in-effect) and, worse, shows a
    // stale image for one extra render whenever the key changes. Holding the
    // href alongside the key it was composited for and falling back to `null`
    // once that key moves on — `useResettingState` — gets the reset for free,
    // and leaves the effect only ever calling `setHref` from inside the async
    // compositing work below.
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
        // `field`/`world.overlays` are re-derived every render; `fieldKey` and
        // `overlayKey` are what should actually retrigger the composite.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldKey, overlayKey]);

    return { href };
}
