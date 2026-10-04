'use client'

import type { ReactNode } from "react";
import InfoButton from "@/components/ui/InfoButton";
import ListRow from "@/components/ui/ListRow";
import Stepper from "@/components/ui/Stepper";

interface AmountSteppersProps<K extends string> {
    /** What can be counted, in the order the rows list them. */
    kinds: readonly K[];
    /** What leads each row: a glyph, which is boxed, or art as `ListRow` takes it. */
    icon: (kind: K) => ReactNode;
    /** Each row's name, and what its stepper reads out to a screen reader. */
    title: (kind: K) => string;
    amounts: Record<K, number>;
    /** The most of each that may be picked; a kind whose most is 0 is left off. */
    max: (kind: K) => number;
    onChange: (amounts: Record<K, number>) => void;
    /** The line under each row — what there is of it, say. */
    sub?: (kind: K) => string;
    /** How far one press moves an amount. */
    step?: number;
    /** Puts an `InfoButton` after each row's title, opening what there is to know about that kind. */
    onInfo?: (kind: K) => void;
}

/**
 * An amount of each of several things, picked with a stepper apiece, as one
 * `ag-list` — either side of a trade offer, a caravan's load. Kingdom Builder
 * wrote it first for its resources; Settlements & Cities' trade offers are the
 * second caller, which is what moved it here. Realm Arena's muster buys its
 * squad and the squad's items with two of them.
 */
export default function AmountSteppers<K extends string>({ kinds, icon, title, amounts, max, onChange, sub, step = 1, onInfo }: AmountSteppersProps<K>) {
    return (
        <div className="ag-list">
            {kinds.filter(kind => max(kind) > 0).map(kind => (
                <ListRow key={kind} icon={icon(kind)} sub={sub?.(kind)}
                    title={onInfo ? <>{title(kind)} <InfoButton label={`About the ${title(kind)}`} onClick={() => onInfo(kind)} /></> : title(kind)}
                    action={<Stepper value={amounts[kind]} min={0} max={max(kind)} step={step} label={title(kind).toLowerCase()}
                        onChange={amount => onChange({ ...amounts, [kind]: amount })} />} />
            ))}
        </div>
    );
}
