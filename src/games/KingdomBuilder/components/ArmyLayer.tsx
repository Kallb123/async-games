'use client'

import ClickableMapNode from "@/components/ui/ClickableMapNode";

import { formatUnits } from "../units";
import type { KingdomBuilderArmyView } from "../worldView";
import { tileIndexCentre, type TerrainField } from "../worldgen/terrainField";

import styles from "./ArmyLayer.module.css";

// Smaller than a settlement's own dot, so an army standing on a town's tile
// still leaves the town readable underneath it.
const ARMY_RADIUS = 0.7;

interface ArmyLayerProps {
    field: Pick<TerrainField, "columns" | "tileSize">;
    armies: readonly KingdomBuilderArmyView[];
    /** The player's own colour — every army here is theirs (§6.3). */
    colour: string;
    /** The route a march being drafted would take, drawn dashed ahead of it. */
    preview?: readonly number[];
    /** The army being given new orders, if any. */
    selectedArmyId?: string;
    /** Tapping an army gives it new orders; absent while a march is already being drafted. */
    onSelect?: (armyId: string) => void;
}

function points(field: ArmyLayerProps["field"], tiles: readonly number[]): string {
    return tiles.map(tile => tileIndexCentre(field, tile)).map(({ x, y }) => `${x},${y}`).join(" ");
}

/**
 * The player's armies on the world map (GDD §6.2): the road each still has to
 * march, along the tiles it takes, and a marker on the tile it stands on —
 * plus, while a march is being drafted, the route it would take. Drawn inside
 * the map's own `<svg>`, over the ground and the routes, under the labels.
 */
export default function ArmyLayer({ field, armies, colour, preview, selectedArmyId, onSelect }: ArmyLayerProps) {
    return (
        <g style={{ color: colour }}>
            {armies.filter(army => army.route.length > 1).map(army => (
                <polyline key={`route-${army.armyId}`} className={styles.route} points={points(field, army.route)} />
            ))}
            {preview && preview.length > 1 && <polyline className={`${styles.route} ${styles.preview}`} points={points(field, preview)} />}
            {armies.map(army => {
                const { x, y } = tileIndexCentre(field, army.tile);
                return (
                    <ClickableMapNode key={army.armyId} x={x} y={y} radius={ARMY_RADIUS} isValid={!!onSelect} isSelected={army.armyId === selectedArmyId} showRing={false}
                        onClick={onSelect && (() => onSelect(army.armyId))}
                        title={`Your army: ${formatUnits(army.units)}`}>
                        <rect className={`${styles.army} ${army.armyId === selectedArmyId ? styles.selected : ""}`}
                            x={x - ARMY_RADIUS} y={y - ARMY_RADIUS} width={ARMY_RADIUS * 2} height={ARMY_RADIUS * 2} transform={`rotate(45 ${x} ${y})`} />
                    </ClickableMapNode>
                );
            })}
        </g>
    );
}
