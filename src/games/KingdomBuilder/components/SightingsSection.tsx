'use client'

import ListRow from "@/components/ui/ListRow";
import ListSection from "@/components/ui/ListSection";

import { formatStack, unitCount } from "../armies";
import { formatUnits, type KingdomBuilderGarrison } from "../units";
import type { KingdomBuilderWorldView } from "../worldView";
import { tileIndexCentre } from "../worldgen/terrainField";

interface SightingsSectionProps {
    view: KingdomBuilderWorldView;
    ownerName: (seat: number) => string;
    /** What the map calls a node — "Your town", "Open site", "Forest". */
    placeName: (nodeId: string) => string;
}

/**
 * What the player can see of everyone else's forces (GDD §6.3): each rival
 * army in sight, near the place on the map closest to it, and each rival town
 * or barbarian village a scout of theirs is close enough to read the garrison of.
 */
export default function SightingsSection({ view, ownerName, placeName }: SightingsSectionProps) {
    const field = view.terrainField;
    const nearestPlace = (tile: number) => {
        if (!field) return undefined;
        const { x, y } = tileIndexCentre(field, tile);
        const nearest = view.nodes.reduce<{ id: string; distance: number } | undefined>((best, node) => {
            const distance = (node.x - x) ** 2 + (node.y - y) ** 2;
            return !best || distance < best.distance ? { id: node.id, distance } : best;
        }, undefined);
        return nearest && placeName(nearest.id);
    };
    const scouted = view.settlements.filter(settlement => !settlement.isMine && settlement.garrison);
    const garrisonLine = (garrison: Partial<KingdomBuilderGarrison>) => unitCount(garrison) > 0 ? `Garrison: ${formatUnits(garrison)}` : "No garrison";

    return (
        <ListSection label="In sight" isLoading={false}
            empty={<div className="ag-empty">No other army in sight.</div>}
            hint="Armies are hidden unless one of your towns or armies is close enough to see them. A barracks watches farther as it grows, and an army with a scout in it sees farthest — far enough to count the garrison of a rival town or a barbarian village.">
            {view.sightings.map((sighting, index) => {
                const place = nearestPlace(sighting.tile);
                return (
                    <ListRow key={`army-${index}`} icon={unitCount(sighting.units) > 0 ? "⚔️" : "🐪"} title={`${ownerName(sighting.seat)}'s ${unitCount(sighting.units) > 0 ? "army" : "caravans"}`}
                        sub={`${formatStack(sighting)}${place ? ` · near ${place}` : ""}`} />
                );
            })}
            {scouted.map(settlement => (
                <ListRow key={`town-${settlement.nodeId}`} icon="🔭" title={`${ownerName(settlement.seat)}'s town`}
                    sub={garrisonLine(settlement.garrison!)} />
            ))}
            {view.barbarians.filter(village => village.garrison).map(village => (
                <ListRow key={`village-${village.nodeId}`} icon="🔭" title="Barbarian village" sub={garrisonLine(village.garrison!)} />
            ))}
        </ListSection>
    );
}
