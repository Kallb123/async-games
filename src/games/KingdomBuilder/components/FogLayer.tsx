'use client'

import { useId } from "react";

import type { KingdomBuilderSight } from "../sight";
import { tileIndexCentre, type TerrainField } from "../worldgen/terrainField";

import styles from "./FogLayer.module.css";

interface FogLayerProps {
    field: Pick<TerrainField, "columns" | "tileSize">;
    width: number;
    height: number;
    /** What the player can see from (§6.3) — the server's own circles, so the fog lifts exactly where another army would be sent. */
    sight: readonly KingdomBuilderSight[];
}

/**
 * Fog of war on the world map (GDD §6.3): the ground outside everything the
 * player can see is shaded. Drawn over the ground and under the settlements,
 * which are public wherever they stand — only armies hide in the fog.
 */
export default function FogLayer({ field, width, height, sight }: FogLayerProps) {
    // useId's own characters aren't all safe inside url(#…).
    const maskId = `fog-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    return (
        <g aria-hidden="true" className={styles.fog}>
            <mask id={maskId}>
                <rect width={width} height={height} fill="white" />
                {sight.map(({ tile, radius }, index) => {
                    const { x, y } = tileIndexCentre(field, tile);
                    // Half a tile past the radius, so a tile at the edge of sight is uncovered whole.
                    return <circle key={index} cx={x} cy={y} r={(radius + 0.5) * field.tileSize} fill="black" />;
                })}
            </mask>
            <rect className={styles.shade} width={width} height={height} mask={`url(#${maskId})`} />
        </g>
    );
}
