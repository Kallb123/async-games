'use client'

import { useState } from "react";

import ActionButton from "@/components/ui/ActionButton";
import ListRow from "@/components/ui/ListRow";
import Section from "@/components/ui/Section";
import { useJsonMutation } from "@/utils/hooks/useJsonMutation";

import type { KingdomBuilderResources } from "../KingdomBuilderSettlementModel";
import { resourceTotal, resourcesIn } from "../market";
import { canAfford, formatResources, resourcesOf } from "../resources";
import type { KingdomBuilderWorldView } from "../worldView";

import ResourceAmounts from "./ResourceAmounts";

interface TradeSectionProps {
    endpoint: string;
    view: KingdomBuilderWorldView;
    ownerName: (seat: number) => string;
    onTraded: (view: KingdomBuilderWorldView) => void;
}

/** The most a new offer's steppers ask for of one resource — a cap on a picker, not a rule. */
const MOST_ASKED = 500;

/**
 * The world's trade board (GDD §4.2, PR 25): every open offer, each with a
 * way to take it — or, for the player's own, to withdraw it — and a form to
 * post a new one. Offers are posted from and taken at a market; with markets
 * at both settlements the player picks which one trades.
 */
export default function TradeSection({ endpoint, view, ownerName, onTraded }: TradeSectionProps) {
    const { submit, isPending, message } = useJsonMutation<KingdomBuilderWorldView>(endpoint, "That trade didn't go through — try again.");
    const mySettlements = view.settlements.filter(settlement => settlement.isMine && settlement.settlementId);
    const markets = mySettlements.filter(settlement => (settlement.marketLevel ?? 0) > 0);
    const [chosen, setChosen] = useState<string | null>(null);
    const from = markets.find(settlement => settlement.settlementId === chosen) ?? markets[0];
    const stores = resourcesOf(from?.resources);
    const [draft, setDraft] = useState<{ gives: KingdomBuilderResources; wants: KingdomBuilderResources } | null>(null);
    // Which offer's button is in flight.
    const [pending, setPending] = useState<string | null>(null);
    if (view.offers.length === 0 && markets.length === 0) return null;

    const run = async (key: string, request: object) => {
        setPending(key);
        const body = await submit(request);
        setPending(null);
        if (body) {
            onTraded(body);
            setDraft(null);
        }
    };
    const settlementName = (settlementId?: string) => `settlement ${mySettlements.findIndex(settlement => settlement.settlementId === settlementId) + 1}`;
    const overlap = !!draft && resourcesIn(draft.gives).some(resource => draft.wants[resource] > 0);
    const canPost = !!draft && !!from && resourceTotal(draft.gives) > 0 && resourceTotal(draft.wants) > 0 && !overlap && canAfford(stores, draft.gives);

    return (
        <Section label="Trade">
            {view.offers.length > 0 && (
                <div className="ag-list">
                    {view.offers.map(offer => {
                        const affordable = !!from && canAfford(stores, offer.wants);
                        return (
                            <ListRow key={offer.offerId} icon="⚖️"
                                title={offer.isMine ? `Your offer from ${settlementName(offer.settlementId)}` : `${ownerName(offer.seat)} offers`}
                                sub={`${formatResources(offer.gives)} for ${formatResources(offer.wants)}`}
                                action={offer.isMine
                                    ? <ActionButton className="ag-btn ag-btn--light" disabled={isPending} pending={pending === offer.offerId} pendingLabel="Withdrawing…"
                                        onClick={() => run(offer.offerId, { action: "withdraw", offerId: offer.offerId })}>Withdraw</ActionButton>
                                    : <ActionButton className="ag-btn ag-btn--light" disabled={!affordable || isPending} pending={pending === offer.offerId} pendingLabel="Trading…"
                                        onClick={() => run(offer.offerId, { action: "accept", offerId: offer.offerId, settlementId: from?.settlementId })}>Accept</ActionButton>} />
                        );
                    })}
                </div>
            )}
            {markets.length > 1 && (
                <div className="ag-chips" role="group" aria-label="Trading from">
                    {markets.map(settlement => (
                        <button key={settlement.settlementId} type="button" className={`ag-chip ${settlement === from ? "ag-chip--active" : ""}`}
                            onClick={() => setChosen(settlement.settlementId!)}>
                            Trade from {settlementName(settlement.settlementId)}
                        </button>
                    ))}
                </div>
            )}
            {markets.length === 0
                ? <p className="ag-hint">Build a market at one of your settlements to post offers and take them.</p>
                : draft
                    ? <>
                        <p className="ag-hint">You give — held from {settlementName(from?.settlementId)}&apos;s stores until the offer is taken or withdrawn</p>
                        <ResourceAmounts amounts={draft.gives} max={resource => stores[resource]} sub={resource => `${stores[resource]} in store`}
                            onChange={gives => setDraft({ ...draft, gives })} />
                        <p className="ag-hint">You ask for</p>
                        <ResourceAmounts amounts={draft.wants} max={() => MOST_ASKED} onChange={wants => setDraft({ ...draft, wants })} />
                        {overlap && <p className="ag-hint">Ask for something other than what you give.</p>}
                        <div className="ag-btn-row">
                            <button type="button" className="ag-btn ag-btn--ghost" disabled={isPending} onClick={() => setDraft(null)}>Cancel</button>
                            <ActionButton className="ag-btn ag-btn--primary" disabled={!canPost || isPending} pending={pending === "offer"} pendingLabel="Posting…"
                                onClick={() => run("offer", { action: "offer", settlementId: from?.settlementId, ...draft })}>Post offer</ActionButton>
                        </div>
                    </>
                    : <>
                        <p className="ag-hint">Offers are open to every player in the world, and trade market to market the moment one is taken. Carry goods by road with a caravan instead.</p>
                        <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={() => setDraft({ gives: resourcesOf(), wants: resourcesOf() })}>Post an offer</button>
                    </>}
            {message && <div className="ag-callout" role="alert">{message}</div>}
        </Section>
    );
}
