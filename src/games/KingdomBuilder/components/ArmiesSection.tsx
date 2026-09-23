'use client'

import BuildRow from "@/components/ui/BuildRow";
import ListRow from "@/components/ui/ListRow";
import Section from "@/components/ui/Section";
import Stepper from "@/components/ui/Stepper";
import { useJsonMutation } from "@/utils/hooks/useJsonMutation";

import { unitCount } from "../armies";
import { formatTicks } from "../tick";
import { KINGDOM_BUILDER_UNIT_TYPES, KINGDOM_BUILDER_UNITS, formatUnits, garrisonOf, type KingdomBuilderGarrison } from "../units";
import type { KingdomBuilderWorldView } from "../worldView";

/**
 * A march being put together on the world map (GDD §6.2): units drawn from
 * one of the player's garrisons, or an army already out — and, once the
 * player has tapped the map, where to.
 */
export type MarchDraft =
    | { settlementId: string; units: KingdomBuilderGarrison; targetNodeId?: string }
    | { armyId: string; targetNodeId?: string };

/** The route the draft would take, as the map previews it: its length in ticks, or no way there at all. */
export type MarchPreview = { ticks: number } | "no-route" | null;

interface ArmiesSectionProps {
    endpoint: string;
    view: KingdomBuilderWorldView;
    march: MarchDraft | null;
    onMarchChange: (march: MarchDraft | null) => void;
    preview: MarchPreview;
    /** What the map calls a node — "Your town", "Open site", "Forest". */
    placeName: (nodeId: string) => string;
    onMarched: (view: KingdomBuilderWorldView) => void;
}

/**
 * The player's armies and the one being sent (§6.2): each army with where
 * it is bound and how long it has left, every garrison that could send one,
 * and — while a march is being drafted — the units going and the ETA the
 * tick will keep. The map is where the destination is picked.
 */
export default function ArmiesSection({ endpoint, view, march, onMarchChange, preview, placeName, onMarched }: ArmiesSectionProps) {
    const { submit, isPending, message } = useJsonMutation<KingdomBuilderWorldView>(endpoint, "The army couldn't set out. Try again.");
    const mySettlements = view.settlements.filter(settlement => settlement.isMine && settlement.settlementId);

    const send = async () => {
        if (!march?.targetNodeId) return;
        const body = await submit({ action: "march", ...march });
        if (body) {
            onMarched(body);
            onMarchChange(null);
        }
    };

    if (march) {
        const origin = "settlementId" in march ? view.settlements.find(settlement => settlement.settlementId === march.settlementId) : undefined;
        const army = "armyId" in march ? view.armies.find(entry => entry.armyId === march.armyId) : undefined;
        const units = "units" in march ? march.units : army?.units;
        const status = !march.targetNodeId
            ? "Tap somewhere on the map to march there."
            : preview === "no-route"
                ? `There is no way across the land to ${placeName(march.targetNodeId)}.`
                : `To ${placeName(march.targetNodeId)}${preview ? ` — ${formatTicks(preview.ticks)}` : ""}.`;
        const canSend = !!march.targetNodeId && preview !== "no-route" && !!units && unitCount(units) > 0 && !isPending;
        return (
            <Section label={army ? "New orders" : "Send an army"}>
                {origin && "units" in march && (
                    <div className="ag-list">
                        {KINGDOM_BUILDER_UNIT_TYPES.filter(unitType => (origin.garrison?.[unitType] ?? 0) > 0).map(unitType => (
                            <ListRow key={unitType} icon={KINGDOM_BUILDER_UNITS[unitType].icon} title={KINGDOM_BUILDER_UNITS[unitType].name}
                                sub={`${origin.garrison?.[unitType]} in the garrison · ${KINGDOM_BUILDER_UNITS[unitType].speed}`}
                                action={<Stepper value={march.units[unitType]} min={0} max={origin.garrison?.[unitType] ?? 0} label={KINGDOM_BUILDER_UNITS[unitType].name.toLowerCase()}
                                    onChange={count => onMarchChange({ ...march, units: { ...march.units, [unitType]: count } })} />} />
                        ))}
                    </div>
                )}
                {army && <p className="ag-hint">{formatUnits(army.units)}</p>}
                <p className="ag-hint" aria-live="polite">{status}</p>
                <div className="ag-btn-row">
                    <button type="button" className="ag-btn ag-btn--ghost" onClick={() => onMarchChange(null)}>Cancel</button>
                    <button type="button" className="ag-btn ag-btn--primary" disabled={!canSend} onClick={send}>{isPending ? "Sending…" : "March"}</button>
                </div>
                {message && <div className="ag-callout" role="alert">{message}</div>}
            </Section>
        );
    }

    return (
        <Section label="Armies">
            {view.armies.length > 0 && (
                <div className="ag-list">
                    {view.armies.map(army => (
                        <ListRow key={army.armyId} icon={army.arrivedAtTick === undefined ? "⚔️" : "⛺"} title={formatUnits(army.units)}
                            sub={army.arrivedAtTick === undefined
                                ? `Marching to ${placeName(army.targetNodeId)} — ${formatTicks(army.ticksToArrive)}`
                                : `Camped at ${placeName(army.targetNodeId)} since tick ${army.arrivedAtTick}`}
                            action={<button type="button" className="ag-btn ag-btn--light" onClick={() => onMarchChange({ armyId: army.armyId })}>Orders</button>} />
                    ))}
                </div>
            )}
            <div className="ag-build-list">
                {mySettlements.map((settlement, index) => {
                    const garrison = garrisonOf(settlement.garrison);
                    const empty = unitCount(garrison) === 0;
                    return (
                        <BuildRow key={settlement.settlementId} icon="🏯" name={`From settlement ${index + 1}`}
                            cost={empty ? "No units in the garrison — train some at the barracks" : formatUnits(garrison)}
                            tag={empty ? "Empty" : "Muster"} tagMuted={empty} disabled={empty}
                            onClick={() => onMarchChange({ settlementId: settlement.settlementId!, units: garrison })} />
                    );
                })}
            </div>
            {view.armies.length === 0 && <p className="ag-hint">Muster a garrison to send an army across the map. An army that marches home rejoins its garrison.</p>}
        </Section>
    );
}
