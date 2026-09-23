'use client'

import { useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import ListRow from "@/components/ui/ListRow";
import Section from "@/components/ui/Section";
import { useJsonMutation } from "@/utils/hooks/useJsonMutation";

import { unitCount } from "../armies";
import { describeSiege } from "../siege";
import { formatUnits } from "../units";
import type { KingdomBuilderWorldView } from "../worldView";

interface SiegesSectionProps {
    endpoint: string;
    view: KingdomBuilderWorldView;
    /** What the map calls a node — "Your town", "Open site", "Forest". */
    placeName: (nodeId: string) => string;
    onFought: (view: KingdomBuilderWorldView) => void;
}

/** A battle being confirmed: which of the player's armies pushes, or which of their towns sallies out. */
type Pending = { action: "push"; armyId: string } | { action: "sally"; settlementId: string };

const keyOf = (pending: Pending) => `${pending.action}:${"armyId" in pending ? pending.armyId : pending.settlementId}`;

/**
 * The sieges the player is in (GDD §8): each of their towns under siege, with
 * what it is costing and the choice to sally out, and each of their armies
 * besieging someone else's, with the choice to push the attack. Either is a
 * battle, so it asks once before it goes; how it went is the Battles
 * section's. Hidden while there is no siege.
 */
export default function SiegesSection({ endpoint, view, placeName, onFought }: SiegesSectionProps) {
    const { submit, isPending, message } = useJsonMutation<KingdomBuilderWorldView>(endpoint, "That didn't go through — try again.");
    // The one battle waiting on a second tap, by `keyOf`.
    const [confirming, setConfirming] = useState<string | null>(null);
    const mySettlements = view.settlements.filter(settlement => settlement.isMine && settlement.settlementId);
    const defending = mySettlements.filter(settlement => settlement.siege);
    const besieging = view.armies.filter(army => army.besiegingSince !== undefined);
    if (defending.length === 0 && besieging.length === 0 && !message) return null;

    const fight = async (pending: Pending) => {
        const body = await submit(pending);
        setConfirming(null);
        if (body) onFought(body);
    };
    const button = (pending: Pending, label: string, disabled = false) => confirming === keyOf(pending)
        ? <div className="ag-btn-row">
            <button type="button" className="ag-btn ag-btn--ghost" disabled={isPending} onClick={() => setConfirming(null)}>Cancel</button>
            <ActionButton className="ag-btn ag-btn--danger" pending={isPending} pendingLabel="Fighting…" onClick={() => fight(pending)}>{label}</ActionButton>
        </div>
        : <button type="button" className="ag-btn ag-btn--light" disabled={disabled || isPending} onClick={() => setConfirming(keyOf(pending))}>{label}</button>;

    return (
        <Section label="Sieges">
            <div className="ag-list">
                {defending.map(settlement => {
                    const garrison = settlement.garrison ?? {};
                    return (
                        <ListRow key={settlement.nodeId} icon="🔥" title={`Settlement ${mySettlements.indexOf(settlement) + 1} is under siege`}
                            sub={`${describeSiege(settlement.siege!, view.currentTick)} Garrison: ${unitCount(garrison) > 0 ? formatUnits(garrison) : "none"}.`}
                            action={button({ action: "sally", settlementId: settlement.settlementId! }, "Sally out", unitCount(garrison) === 0)} />
                    );
                })}
                {besieging.map(army => (
                    <ListRow key={army.armyId} icon="🏹" title={`Besieging ${placeName(army.targetNodeId)}`}
                        sub={`${formatUnits(army.units)} · since tick ${army.besiegingSince}`}
                        action={button({ action: "push", armyId: army.armyId }, "Push the attack")} />
                ))}
            </div>
            <p className="ag-hint">
                A siege halves the town&apos;s production, and after a short grace period stops its building and training too.
                Pushing the attack sends every army you have at the town against its garrison; sallying out sends the whole garrison against every army at the gate.
                Behind its defences the garrison takes less from every blow, which siege engines break down; out in the open it gets no such help.
            </p>
            {message && <div className="ag-callout" role="alert">{message}</div>}
        </Section>
    );
}
