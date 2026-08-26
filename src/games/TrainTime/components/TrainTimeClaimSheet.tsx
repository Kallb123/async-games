'use client'
import React, { useState } from 'react';
import type { ITrainTimePlayerStateResponse } from '@/games/TrainTime/apiModels';
import {
    PaymentOption,
    TRAINS_PER_PLAYER,
    TrainTimeRouteDef,
    cityName,
    paymentOptions,
    routeScore,
    TrainTimeCardColour,
} from '@/games/TrainTime/board';
import { CARD_LABEL, TRACK_PALETTE, cardFaceStyle } from '@/games/TrainTime/ui';
import ActionButton from '@/components/ui/ActionButton';
import { useCloseRequest } from '@/utils/hooks/useCloseRequest';
import { pluralize } from '@/utils/ui/text';

interface TrainTimeClaimSheetProps {
    route: TrainTimeRouteDef;
    hand: TrainTimeCardColour[];
    me: ITrainTimePlayerStateResponse;
    /** The player's longest continuous run of track if this claim goes through (§7). */
    runAfterClaim: number;
    onClaim: (payment: TrainTimeCardColour[]) => void;
    onBack: () => void;
    pending: boolean;
}

/** "3 Black + 1 Loco" — what an option actually spends. */
function describePayment(payment: TrainTimeCardColour[]): string {
    const counts = new Map<TrainTimeCardColour, number>();
    for (const card of payment) counts.set(card, (counts.get(card) ?? 0) + 1);
    return [...counts].map(([colour, count]) => `${count} ${CARD_LABEL[colour]}`).join(' + ');
}

/** Why this option costs what it costs, in the player's terms. */
function explain(option: PaymentOption, route: TrainTimeRouteDef, hand: TrainTimeCardColour[]): string {
    if (option.shortfall > 0) {
        const owned = hand.filter(c => c === option.colour).length;
        const engines = hand.filter(c => c === 'engine').length;
        const held = engines > 0
            ? `${owned} ${CARD_LABEL[option.colour]} and ${pluralize(engines, 'Loco')}`
            : `${owned} ${CARD_LABEL[option.colour]}`;
        return `${route.length} ${CARD_LABEL[option.colour]} — you hold ${held}, ${pluralize(option.shortfall, 'card')} short.`;
    }
    if (option.enginesUsed === 0) return `${describePayment(option.payment)} — no wilds spent.`;
    if (option.enginesUsed === route.length) return 'Paid entirely in Locos — every wild you hold goes on this route.';
    return `${describePayment(option.payment)} — ${pluralize(option.enginesUsed, 'Loco')} spent as a wild.`;
}

/**
 * The claim sheet (design 14b): the route drawn out segment by segment, every
 * way the hand could pay for it priced side by side, and what the spend leaves
 * behind. Claiming is the only scoring action in the game, so it gets a whole
 * screen rather than a button.
 */
export default function TrainTimeClaimSheet({ route, hand, me, runAfterClaim, onClaim, onBack, pending }: TrainTimeClaimSheetProps) {
    // Mounted only while the sheet is up, so a close request here always
    // means "back to the map" rather than out of the game.
    useCloseRequest(true, onBack);

    const options = paymentOptions(route, hand);
    const payable = options.filter(o => o.shortfall === 0);
    // Near-misses are worth showing — "one more black" is the whole reason to
    // spend a turn drawing — but only the closest couple.
    const shortlist = options.filter(o => o.shortfall > 0).slice(0, 2);
    const [chosen, setChosen] = useState(0);
    const option = payable[chosen];

    const points = routeScore(route.length);
    const trackColour = TRACK_PALETTE[route.colour].fill;

    return (
        <>
            <div className="ag-tt-sheet-head">
                <div className="ag-tt-route">
                    <div className="ag-tt-route-city">
                        <div className="ag-tt-route-dot" />
                        {cityName(route.cityA)}
                    </div>
                    <div className="ag-tt-route-track">
                        {Array.from({ length: route.length }, (_, i) => (
                            <span key={i} className="ag-tt-route-seg" style={{ background: trackColour }} />
                        ))}
                    </div>
                    <div className="ag-tt-route-city">
                        <div className="ag-tt-route-dot" />
                        {cityName(route.cityB)}
                    </div>
                </div>
                <div className="ag-tt-route-tags">
                    <span className="ag-tt-route-tag">{pluralize(route.length, 'segment')} · {route.colour}</span>
                    <span className="ag-tt-route-tag ag-tt-route-tag--score">+{points} points</span>
                </div>
            </div>

            <div className="ag-actionsheet">
                <div className="ag-hand-head">
                    <span className="ag-hand-title">How you pay</span>
                </div>
                <div className="ag-tt-pay">
                    {payable.map((o, i) => (
                        <button
                            key={o.colour}
                            type="button"
                            className={`ag-tt-pay-option${i === chosen ? ' ag-tt-pay-option--on' : ''}`}
                            onClick={() => setChosen(i)}
                        >
                            <div className="ag-tt-pay-top">
                                <div className="ag-tt-pay-cards">
                                    {o.payment.map((card, j) => (
                                        <span key={j} className="ag-tt-pay-card" style={cardFaceStyle(card)} />
                                    ))}
                                </div>
                                {i === chosen && <span className="ag-tt-pay-check">✓</span>}
                            </div>
                            <p className="ag-tt-pay-note">{explain(o, route, hand)}</p>
                        </button>
                    ))}

                    {shortlist.map(o => (
                        <div key={o.colour} className="ag-tt-pay-option ag-tt-pay-option--short">
                            <div className="ag-tt-pay-top">
                                <div className="ag-tt-pay-cards">
                                    {Array.from({ length: route.length }, (_, j) => {
                                        const held = j < route.length - o.shortfall;
                                        return held
                                            ? <span key={j} className="ag-tt-pay-card" style={cardFaceStyle(o.colour)} />
                                            : <span key={j} className="ag-tt-pay-card ag-tt-pay-card--gap" />;
                                    })}
                                </div>
                                <span className="ag-tt-pay-short">{o.shortfall} short</span>
                            </div>
                            <p className="ag-tt-pay-note">{explain(o, route, hand)}</p>
                        </div>
                    ))}
                </div>

                <div className="ag-tt-after">
                    <div className="ag-hand-head">
                        <span className="ag-hand-title">After this claim</span>
                    </div>
                    <div className="ag-tt-after-row">
                        <span>Score</span>
                        <span className="ag-tt-after-value">
                            {me.score} → <span className="ag-tt-after-to">{me.score + points}</span>
                        </span>
                    </div>
                    <div className="ag-tt-after-row">
                        <span>Trains left</span>
                        <span className="ag-tt-after-value">{me.trains} → {me.trains - route.length}</span>
                    </div>
                    <div className="ag-tt-after-row">
                        <span>Cards in hand</span>
                        <span className="ag-tt-after-value">{hand.length} → {hand.length - route.length}</span>
                    </div>
                    {/* The Long Haul bonus is +10 at the end, so a claim that
                        extends your longest run is worth more than its points. */}
                    <div className="ag-tt-after-row">
                        <span>Longest run</span>
                        <span className="ag-tt-after-value">
                            {me.longestRun}
                            {runAfterClaim > me.longestRun && <> → <span className="ag-tt-after-to">{runAfterClaim}</span></>}
                        </span>
                    </div>
                    {me.trains - route.length <= 2 && (
                        <p className="ag-tt-pay-note">
                            ◆ This drops you to {pluralize(me.trains - route.length, 'train')} — everyone gets one final
                            turn and the game ends.
                        </p>
                    )}
                    <p className="ag-tt-pay-note">
                        {pluralize(TRAINS_PER_PLAYER - me.trains + route.length, 'train')} laid of {TRAINS_PER_PLAYER}.
                    </p>
                </div>

                <div className="ag-btn-row" style={{ marginTop: 14 }}>
                    <ActionButton
                        className="ag-btn ag-btn--primary ag-btn--block"
                        disabled={!option}
                        pending={pending}
                        pendingLabel="Laying track…"
                        onClick={() => option && onClaim(option.payment)}
                    >
                        Lay {pluralize(route.length, 'train')}
                    </ActionButton>
                    <button type="button" className="ag-btn ag-btn--ghost ag-tt-side-btn" onClick={onBack}>
                        Back
                    </button>
                </div>
            </div>
        </>
    );
}
