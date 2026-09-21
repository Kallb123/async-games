'use client'

// Rendering beneath the node graph (GDD §3.5.6): composites the generated
// ground into one offscreen canvas, once per world, and hands back an object
// URL the map draws as a single `<image>` — the same single-raster board
// World Domination and Outbreak already draw. `MapEdges`, the node graph and
// `MapLabelLayer` are untouched; the tiles just go underneath them.

import { useEffect, useMemo } from "react";

import { useResettingState } from "@/utils/hooks/useResettingState";
import { areaForCode } from "./worldgen/areas";
import type { OverlayPlacement } from "./worldgen/overlays";
import type { TerrainField } from "./worldgen/terrainField";
import { sheetTilePixels } from "./tileset";

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
 * Pass one of §3.5.6's three: every area's fill, in the ground beneath every
 * tile. No sheet has landed yet (PR 11), so this is the only pass that draws
 * anything today — the fallback colour every entry declares for exactly this
 * reason. Passes two (border-overlay tiles) and three (the sparse overlay
 * list) have nothing to draw until a sheet exists: a flat fill needs no
 * border to blend into, and an overlay with no art draws nothing rather than
 * a coloured square.
 */
function paintFallbackFill(context: CanvasRenderingContext2D, field: TerrainField, tilePixels: number): void {
    for (let row = 0; row < field.rows; row++) {
        for (let col = 0; col < field.columns; col++) {
            const area = areaForCode(field.codes[row * field.columns + col]);
            context.fillStyle = area.fallbackColour;
            context.fillRect(col * tilePixels, row * tilePixels, tilePixels, tilePixels);
        }
    }
}

function compositeTerrain(field: TerrainField): HTMLCanvasElement | null {
    if (!terrainFieldMatchesGrid(field)) {
        if (!loggedFieldMismatch) {
            loggedFieldMismatch = true;
            console.warn("Kingdom Builder: terrain field length disagrees with its grid — drawing no ground layer.");
        }
        return null;
    }

    const tilePixels = sheetTilePixels();
    const canvas = document.createElement("canvas");
    canvas.width = field.columns * tilePixels;
    canvas.height = field.rows * tilePixels;
    const context = canvas.getContext("2d");
    if (!context) return null;

    paintFallbackFill(context, field, tilePixels);
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
    // `toBlob` callback.
    const [href, setHref] = useResettingState<string | null>(null, `${fieldKey}::${overlayKey}`);

    useEffect(() => {
        if (!field) return;
        const canvas = compositeTerrain(field);
        if (!canvas) return;

        let cancelled = false;
        let objectUrl: string | null = null;
        canvas.toBlob(blob => {
            if (cancelled || !blob) return;
            objectUrl = URL.createObjectURL(blob);
            setHref(objectUrl);
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
