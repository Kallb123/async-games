'use client'

import BuildRow from "@/components/ui/BuildRow";
import ListRow from "@/components/ui/ListRow";
import Section from "@/components/ui/Section";
import Stepper from "@/components/ui/Stepper";
import { useJsonMutation } from "@/utils/hooks/useJsonMutation";

import type { KingdomBuilderResources } from "../KingdomBuilderSettlementModel";
import { formatStack, isCamped, isEscorted, unitCount } from "../armies";
import { KINGDOM_BUILDER_STARTING_STOCKPILE } from "../buildings";
import { KINGDOM_BUILDER_HOME_ONLY, KINGDOM_BUILDER_NEEDS_COMMANDER, isLeaderless } from "../commanders";
import { KINGDOM_BUILDER_CARAVAN_CAPACITY, caravanCapacityOf, resourceTotal } from "../market";
import { formatResources, resourcesOf } from "../resources";
import { openSites } from "../sites";
import { formatTicks } from "../tick";
import { KINGDOM_BUILDER_UNIT_TYPES, KINGDOM_BUILDER_UNITS, garrisonOf, type KingdomBuilderGarrison } from "../units";
import type { KingdomBuilderArmyView, KingdomBuilderWorldView } from "../worldView";

import ResourceAmounts from "./ResourceAmounts";

/**
 * A march being put together on the world map (GDD §6.2): units drawn from
 * one of the player's garrisons — with caravans from its market and what
 * they are loaded with (PR 25) — or an army already out; and, once the
 * player has tapped the map, where to.
 */
export type MarchDraft =
    | { settlementId: string; units: KingdomBuilderGarrison; caravans: number; cargo: KingdomBuilderResources; targetNodeId?: string }
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

/** What a stack does where it has camped (PR 25, PR 24), each its own command on the world route. */
type CampAction = { action: "detach" } | { action: "unload" } | { action: "join"; intoArmyId: string } | { action: "settle" };

/** How a stack reads in a list: soldiers march, settlers, caravans and a lone commander travel. */
function stackIcon(army: KingdomBuilderArmyView): string {
    if (!isEscorted(army)) {
        if (army.units.settler > 0) return KINGDOM_BUILDER_UNITS.settler.icon;
        return army.caravans > 0 ? "🐪" : KINGDOM_BUILDER_UNITS.commander.icon;
    }
    return army.arrivedAtTick === undefined ? "⚔️" : army.besiegingSince === undefined ? "⛺" : "🏹";
}

/**
 * The player's armies and the one being sent (§6.2): each army with where
 * it is bound and how long it has left, every garrison that could send one,
 * and — while a march is being drafted — the units and caravans going and the
 * ETA the tick will keep. The map is where the destination is picked; an
 * army's orders also offer what it can do where it has camped.
 */
export default function ArmiesSection({ endpoint, view, march, onMarchChange, preview, placeName, onMarched }: ArmiesSectionProps) {
    const { submit, isPending, message } = useJsonMutation<KingdomBuilderWorldView>(endpoint, "The army couldn't set out. Try again.");
    const mySettlements = view.settlements.filter(settlement => settlement.isMine && settlement.settlementId);
    const villages = new Set(view.barbarians.map(village => village.nodeId));

    const run = async (request: object) => {
        const body = await submit(request);
        if (body) {
            onMarched(body);
            onMarchChange(null);
        }
    };
    const send = () => march?.targetNodeId && run({ action: "march", ...march });

    if (march) {
        const origin = "settlementId" in march ? view.settlements.find(settlement => settlement.settlementId === march.settlementId) : undefined;
        const army = "armyId" in march ? view.armies.find(entry => entry.armyId === march.armyId) : undefined;
        const stack = "units" in march ? march : army;
        // Soldiers leave a garrison only behind a commander (§6.5); an army out that has lost its own can only come home.
        const unled = !!origin && "units" in march && isLeaderless(march);
        const status = unled
            ? KINGDOM_BUILDER_NEEDS_COMMANDER
            : !march.targetNodeId
                ? army && isLeaderless(army) ? `${KINGDOM_BUILDER_HOME_ONLY} — tap one of your towns.` : "Tap somewhere on the map to march there."
                : preview === "no-route"
                    ? `There is no way across the land to ${placeName(march.targetNodeId)}.`
                    : `To ${placeName(march.targetNodeId)}${preview ? ` — ${formatTicks(preview.ticks)}` : ""}.`;
        const overloaded = "cargo" in march && resourceTotal(march.cargo) > caravanCapacityOf(march.caravans);
        const canSend = !unled && !!march.targetNodeId && preview !== "no-route" && !!stack && unitCount(stack.units) + (stack.caravans ?? 0) > 0 && !overloaded && !isPending;
        return (
            <Section label={army ? "New orders" : "Send an army"}>
                {origin && "units" in march && (
                    <div className="ag-list">
                        {KINGDOM_BUILDER_UNIT_TYPES.filter(unitType => (origin.garrison?.[unitType] ?? 0) > 0).map(unitType => (
                            <ListRow key={unitType} icon={KINGDOM_BUILDER_UNITS[unitType].icon} title={KINGDOM_BUILDER_UNITS[unitType].name}
                                sub={`${origin.garrison?.[unitType]} in the garrison · move ${KINGDOM_BUILDER_UNITS[unitType].speed}`}
                                action={<Stepper value={march.units[unitType]} min={0} max={origin.garrison?.[unitType] ?? 0} label={KINGDOM_BUILDER_UNITS[unitType].name.toLowerCase()}
                                    onChange={count => onMarchChange({ ...march, units: { ...march.units, [unitType]: count } })} />} />
                        ))}
                    </div>
                )}
                {origin && "units" in march && (origin.caravans ?? 0) > 0 && (
                    <LoadCaravans march={march} caravansReady={origin.caravans ?? 0} stores={resourcesOf(origin.resources)} onChange={onMarchChange} />
                )}
                {army && <p className="ag-hint">{formatStack(army)}{army.caravans > 0 ? ` — carrying ${formatResources(army.cargo) || "nothing"}` : ""}</p>}
                {army && <CampActions army={army} view={view} placeName={placeName} disabled={isPending} onAction={request => run({ ...request, armyId: army.armyId })} />}
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
                        <ListRow key={army.armyId} icon={stackIcon(army)}
                            title={isLeaderless(army) ? <>{formatStack(army)} <span className="ag-tag ag-tag--quiet">No commander</span></> : formatStack(army)}
                            sub={army.arrivedAtTick === undefined
                                ? `Marching to ${placeName(army.targetNodeId)} — ${formatTicks(army.ticksToArrive)}`
                                : villages.has(army.targetNodeId)
                                    ? "Fighting the barbarians — again each tick until one side is gone"
                                    : army.besiegingSince === undefined
                                    ? `Camped at ${placeName(army.targetNodeId)} since tick ${army.arrivedAtTick}`
                                    : `Besieging ${placeName(army.targetNodeId)} since tick ${army.besiegingSince}`}
                            action={<button type="button" className="ag-btn ag-btn--light" onClick={() => onMarchChange({ armyId: army.armyId })}>Orders</button>} />
                    ))}
                </div>
            )}
            <div className="ag-build-list">
                {mySettlements.map((settlement, index) => {
                    const garrison = garrisonOf(settlement.garrison);
                    const caravans = settlement.caravans ?? 0;
                    const empty = unitCount(garrison) + caravans === 0;
                    return (
                        <BuildRow key={settlement.settlementId} icon="🏯" name={`From settlement ${index + 1}`}
                            cost={empty ? "No units in the garrison — train some at the barracks" : formatStack({ units: garrison, caravans })}
                            tag={empty ? "Empty" : "Muster"} tagMuted={empty} disabled={empty}
                            // One commander leads the muster by default; the rest stay to lead the next.
                            onClick={() => onMarchChange({ settlementId: settlement.settlementId!, units: { ...garrison, commander: Math.min(1, garrison.commander) }, caravans: 0, cargo: resourcesOf() })} />
                    );
                })}
            </div>
            {view.armies.length === 0 && <p className="ag-hint">Muster a garrison to send an army across the map. An army that marches home rejoins its garrison, one that reaches another player&apos;s town lays siege to it, and one that reaches a barbarian village fights for it at once — take it and it becomes your town. Caravans from a market go with an army, or alone, to carry the stores; they unload when they reach one of your towns. A settler from a town centre founds a new town on the open site it camps at. Caravans and settlers left with no escort are taken by any rival army that meets them. Soldiers march out only behind a commander from a tavern; scouts, caravans and settlers go without.</p>}
        </Section>
    );
}

type SettlementDraft = Extract<MarchDraft, { settlementId: string }>;

/** How many of the market's caravans go, and what they are loaded with — never more than they carry, nor than is in store. */
function LoadCaravans({ march, caravansReady, stores, onChange }: {
    march: SettlementDraft;
    caravansReady: number;
    stores: KingdomBuilderResources;
    onChange: (march: SettlementDraft) => void;
}) {
    const room = caravanCapacityOf(march.caravans) - resourceTotal(march.cargo);
    return (
        <>
            <div className="ag-list">
                <ListRow icon="🐪" title="Caravans" sub={`${caravansReady} ready · each carries ${KINGDOM_BUILDER_CARAVAN_CAPACITY} · slow`}
                    action={<Stepper value={march.caravans} min={0} max={caravansReady} label="caravans"
                        onChange={caravans => onChange({ ...march, caravans, cargo: caravans === 0 ? resourcesOf() : march.cargo })} />} />
            </div>
            {march.caravans > 0 && (
                <>
                    <ResourceAmounts amounts={march.cargo} onChange={cargo => onChange({ ...march, cargo })}
                        max={resource => Math.min(stores[resource], march.cargo[resource] + Math.max(0, room))}
                        sub={resource => `${stores[resource]} in store`} />
                    <p className="ag-hint">{room >= 0 ? `Room for ${room} more.` : `That's ${-room} more than the caravans can carry.`}</p>
                </>
            )}
        </>
    );
}

/**
 * What an army can do where it has camped (PR 25): split its caravans off,
 * join another of the player's stacks camped with it, unload into the town
 * there, or — with a settler, on an open site — found a town (PR 24). Each is
 * offered only when it would go through.
 */
function CampActions({ army, view, placeName, disabled, onAction }: {
    army: KingdomBuilderArmyView;
    view: KingdomBuilderWorldView;
    placeName: (nodeId: string) => string;
    disabled: boolean;
    onAction: (request: CampAction) => void;
}) {
    if (!isCamped(army)) return null;
    const villages = new Set(view.barbarians.map(village => village.nodeId));
    const others = view.armies.filter(other => other.armyId !== army.armyId && isCamped(other) && other.targetNodeId === army.targetNodeId);
    const canDetach = army.caravans > 0 && isEscorted(army) && !villages.has(army.targetNodeId);
    const canUnload = resourceTotal(army.cargo) > 0 && army.besiegingSince === undefined && view.settlements.some(settlement => settlement.nodeId === army.targetNodeId);
    const canSettle = army.units.settler > 0 && openSites(view).some(node => node.id === army.targetNodeId);
    if (!canDetach && !canUnload && !canSettle && others.length === 0) return null;
    return (
        <div className="ag-build-list">
            {canSettle && <BuildRow icon={KINGDOM_BUILDER_UNITS.settler.icon} name="Found a town here"
                cost={`Spends a settler, who brings ${formatResources(KINGDOM_BUILDER_STARTING_STOCKPILE)}; everything of yours camped here moves in`}
                tag="Found" disabled={disabled} onClick={() => onAction({ action: "settle" })} />}
            {canUnload && <BuildRow icon="📦" name={`Unload at ${placeName(army.targetNodeId)}`} cost={`${formatResources(army.cargo)} into their stores`}
                tag="Unload" disabled={disabled} onClick={() => onAction({ action: "unload" })} />}
            {canDetach && <BuildRow icon="🐪" name="Detach the caravans" cost="They camp here on their own, to send on or unload"
                tag="Detach" disabled={disabled} onClick={() => onAction({ action: "detach" })} />}
            {others.map(other => (
                <BuildRow key={other.armyId} icon="🤝" name={`Join ${formatStack(other)}`} cost="Camped here too — march on as one"
                    tag="Join" disabled={disabled} onClick={() => onAction({ action: "join", intoArmyId: other.armyId })} />
            ))}
        </div>
    );
}
