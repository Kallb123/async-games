'use client'

import { useState, type ReactNode } from "react";

import ActionButton from "@/components/ui/ActionButton";
import BuildRow from "@/components/ui/BuildRow";
import Section from "@/components/ui/Section";
import Stepper from "@/components/ui/Stepper";

import { KINGDOM_BUILDER_CARAVAN_CAPACITY, KINGDOM_BUILDER_CARAVAN_COST, exchangeRateFor, formatRate } from "../market";
import type { KingdomBuilderSettlementView } from "../prototype";
import { KINGDOM_BUILDER_RESOURCE_ICONS, KINGDOM_BUILDER_RESOURCE_TYPES, canAfford, formatResources, type KingdomBuilderResourceType } from "../resources";

interface MarketSectionProps {
    view: KingdomBuilderSettlementView;
    marketLevel: number;
    /** The row that raises the market a level, drawn the way the barracks' is. */
    upgrade?: ReactNode;
    /** Which row's command is in flight, by the key it was sent with. */
    pending: string | null;
    isPending: boolean;
    onSend: (key: string, request: object) => void;
}

/**
 * The settlement's market (GDD §4.2, §4.3, PR 25): one resource exchanged for
 * another at the market's rate — worse than making it, better than waiting —
 * and caravans bought to carry the stores to another settlement. Trade with
 * other players is on the world map, where they are.
 */
export default function MarketSection({ view, marketLevel, upgrade, pending, isPending, onSend }: MarketSectionProps) {
    const [give, setGive] = useState<KingdomBuilderResourceType>("wood");
    const [get, setGet] = useState<KingdomBuilderResourceType>("iron");
    const [wanted, setWanted] = useState(1);
    const rate = exchangeRateFor(marketLevel) ?? 1;
    const most = Math.floor(view.resources[give] / rate);
    const amount = Math.max(1, Math.min(wanted, most));
    const canExchange = most >= 1 && give !== get;
    const caravanAffordable = canAfford(view.resources, KINGDOM_BUILDER_CARAVAN_COST);

    const pickGive = (resource: KingdomBuilderResourceType) => {
        setGive(resource);
        if (resource === get) setGet(KINGDOM_BUILDER_RESOURCE_TYPES.find(other => other !== resource)!);
    };

    return (
        <Section label="Market" action={<span className="ag-tag">Level {marketLevel}</span>}>
            <p className="ag-hint">
                The market trades {formatRate(marketLevel)}, and sells caravans to carry the stores to your other settlement or to another player&apos;s.
                {view.caravans > 0 ? ` ${view.caravans} caravan${view.caravans === 1 ? "" : "s"} ready to load — muster one from the world map.` : ""}
            </p>
            <div className="ag-build-list">
                {upgrade}
                <BuildRow icon="🐪" name="Buy a caravan"
                    cost={`${formatResources(KINGDOM_BUILDER_CARAVAN_COST)} · carries ${KINGDOM_BUILDER_CARAVAN_CAPACITY} · slow`}
                    tag={pending === "caravan" ? "Buying…" : caravanAffordable ? "Buy" : "Can't afford"}
                    tagMuted={!caravanAffordable} disabled={!caravanAffordable || isPending} pending={pending === "caravan"}
                    onClick={() => onSend("caravan", { action: "caravan" })} />
            </div>
            <div className="ag-trade-section">
                <div className="ag-trade-label">You give</div>
                <div className="ag-trade-grid">
                    {KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => {
                        const affordable = view.resources[resource] >= rate;
                        return (
                            <button key={resource} type="button" disabled={!affordable} onClick={() => pickGive(resource)}
                                className={`ag-trade-opt${give === resource ? " ag-trade-opt--active" : ""}${affordable ? "" : " ag-trade-opt--disabled"}`}>
                                <span className="ag-trade-opt-emoji">{KINGDOM_BUILDER_RESOURCE_ICONS[resource]}</span>
                                <span className="ag-trade-opt-ratio">{rate}:1</span>
                                <span className="ag-trade-opt-have">have {view.resources[resource]}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="ag-trade-section">
                <div className="ag-trade-label">You get</div>
                <div className="ag-trade-grid">
                    {KINGDOM_BUILDER_RESOURCE_TYPES.map(resource => (
                        <button key={resource} type="button" disabled={resource === give} onClick={() => setGet(resource)}
                            className={`ag-trade-opt${get === resource ? " ag-trade-opt--active" : ""}${resource === give ? " ag-trade-opt--disabled" : ""}`}>
                            <span className="ag-trade-opt-emoji">{KINGDOM_BUILDER_RESOURCE_ICONS[resource]}</span>
                            <span className="ag-trade-opt-have">{resource === give ? "giving" : resource}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div className="ag-trade-preview">
                <span>{amount * rate} {KINGDOM_BUILDER_RESOURCE_ICONS[give]}</span>
                <span className="ag-trade-preview-arrow">→</span>
                <span>{amount} {KINGDOM_BUILDER_RESOURCE_ICONS[get]}</span>
            </div>
            <div className="ag-btn-row">
                <Stepper value={amount} min={1} max={Math.max(1, most)} label={get} onChange={setWanted} />
                <ActionButton className="ag-btn ag-btn--primary" disabled={!canExchange || isPending} pending={pending === "exchange"} pendingLabel="Exchanging…"
                    onClick={() => onSend("exchange", { action: "exchange", give, get, amount })}>Exchange</ActionButton>
            </div>
            {!canExchange && <p className="ag-hint">Not enough {give} to exchange yet — the market wants {rate} for each one it gives.</p>}
        </Section>
    );
}
