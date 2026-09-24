'use client'

import ListRow from "@/components/ui/ListRow";
import Stepper from "@/components/ui/Stepper";

import type { KingdomBuilderResources } from "../KingdomBuilderSettlementModel";
import { KINGDOM_BUILDER_RESOURCE_ICONS, KINGDOM_BUILDER_RESOURCE_TYPES, type KingdomBuilderResourceType } from "../resources";

interface ResourceAmountsProps {
    amounts: KingdomBuilderResources;
    /** The most of each resource that may be picked; a resource whose most is 0 is left off. */
    max: (resource: KingdomBuilderResourceType) => number;
    onChange: (amounts: KingdomBuilderResources) => void;
    /** The line under each resource — what there is of it, say. */
    sub?: (resource: KingdomBuilderResourceType) => string;
    /** How far one press moves an amount. */
    step?: number;
}

/**
 * An amount of each resource picked with a stepper apiece (PR 25) — a
 * caravan's load at muster, and either side of a trade offer.
 */
export default function ResourceAmounts({ amounts, max, onChange, sub, step = 5 }: ResourceAmountsProps) {
    return (
        <div className="ag-list">
            {KINGDOM_BUILDER_RESOURCE_TYPES.filter(resource => max(resource) > 0).map(resource => (
                <ListRow key={resource} icon={KINGDOM_BUILDER_RESOURCE_ICONS[resource]} title={resource[0].toUpperCase() + resource.slice(1)} sub={sub?.(resource)}
                    action={<Stepper value={amounts[resource]} min={0} max={max(resource)} step={step} label={resource}
                        onChange={amount => onChange({ ...amounts, [resource]: amount })} />} />
            ))}
        </div>
    );
}
