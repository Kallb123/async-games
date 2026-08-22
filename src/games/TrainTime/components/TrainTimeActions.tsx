'use client'
import React from 'react';
import type { ITrainTimeSpecificGameStateResponse } from '@/games/TrainTime/apiModels';
import {
    ClaimContext,
    ROUTES,
    TRAIN_TIME_CARD_COLOURS,
    TrainTimeCardColour,
    buildPayment,
    claimBlockedReason,
    payableColours,
    routeName,
    routeScore,
} from '@/games/TrainTime/board';
import { CARD_LABEL, TRACK_PALETTE } from '@/games/TrainTime/ui';
import ActionButton from '@/components/ui/ActionButton';
import { pluralize } from '@/utils/ui/text';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
import {
    TrainTimeClaimRoute,
    TrainTimeDrawCarriageCard,
    TrainTimePassTurn,
} from '@/utils/apiModels/GameLogic';

const HAND_ORDER: TrainTimeCardColour[] = [...TRAIN_TIME_CARD_COLOURS, 'engine'];

/** A colour swatch used by every card chip, in the market and in the hand. */
function CardSwatch({ colour }: { colour: TrainTimeCardColour }) {
    const palette = TRACK_PALETTE[colour];
    return <span className="ag-tt-swatch" style={{ background: palette.fill, borderColor: palette.stroke }} />;
}

/** "3 Blue + 1 Engine" — how a payment reads on the claim button. */
function describePayment(payment: TrainTimeCardColour[]): string {
    const counts = new Map<TrainTimeCardColour, number>();
    for (const card of payment) counts.set(card, (counts.get(card) ?? 0) + 1);
    return [...counts].map(([colour, count]) => `${count} ${CARD_LABEL[colour]}`).join(' + ');
}

interface TrainTimeActionsProps {
    gs: ITrainTimeSpecificGameStateResponse;
    myUsername: string;
    /** Built once by the screen — see the board page. */
    claimContext: ClaimContext | null;
    selectedRouteId: number | null;
    setSelectedRouteId: (routeId: number | null) => void;
    submitCommand: SubmitCommand;
    pendingTarget: string | null;
}

/**
 * The active player's turn: exactly one of drawing two carriage cards or
 * claiming the route they've tapped on the map (design doc §5).
 */
export default function TrainTimeActions({
    gs, myUsername, claimContext, selectedRouteId, setSelectedRouteId, submitCommand, pendingTarget,
}: TrainTimeActionsProps) {
    const me = gs.playerStates[myUsername];
    if (!me) return null;

    const hand = gs.myHand;
    const midDraw = gs.drawsThisTurn > 0;
    const deckEmpty = gs.deckCount === 0 && gs.discardCount === 0;
    const nothingToDraw = deckEmpty && gs.market.length === 0;

    const selectedRoute = selectedRouteId === null ? null : ROUTES[selectedRouteId];
    const blockedReason = selectedRoute && claimContext ? claimBlockedReason(selectedRoute, claimContext) : null;

    function draw(source: 'deck' | 'market', marketIndex = 0) {
        const command = new TrainTimeDrawCarriageCard();
        command.source = source;
        command.marketIndex = marketIndex;
        submitCommand(command, undefined, `draw-${source}-${marketIndex}`);
    }

    function claim(colour: TrainTimeCardColour) {
        if (!selectedRoute) return;
        const command = new TrainTimeClaimRoute();
        command.routeId = selectedRoute.id;
        command.cards = buildPayment(selectedRoute, colour, hand);
        submitCommand(command, () => setSelectedRouteId(null), `claim-${colour}`);
    }

    const handChips = (
        <div className="ag-hand">
            <div className="ag-hand-head">
                <span className="ag-hand-title">Your hand</span>
                <span className="ag-hand-note">
                    {pluralize(hand.length, 'card')} · {pluralize(me.trains, 'train')} left
                </span>
            </div>
            <div className="ag-hand-devs">
                {HAND_ORDER.filter(colour => hand.includes(colour)).map(colour => (
                    <span key={colour} className="ag-devchip">
                        <CardSwatch colour={colour} />
                        <span className="ag-devchip-name">{CARD_LABEL[colour]}</span>
                        <span className="ag-devchip-count">{hand.filter(c => c === colour).length}</span>
                    </span>
                ))}
                {hand.length === 0 && <span className="ag-hand-note">No cards yet — draw two.</span>}
            </div>
        </div>
    );

    return (
        <>
            {handChips}
            <div className="ag-actionsheet">
                {selectedRoute && (
                    <div className="ag-callout" style={{ marginBottom: 10 }}>
                        <b>{routeName(selectedRoute)}</b> · {selectedRoute.length} × {selectedRoute.colour} · +{routeScore(selectedRoute.length)} points
                        {blockedReason === 'own-twin' && <div>You already own the parallel track.</div>}
                        {blockedReason === 'twin-taken' && <div>The parallel track is taken — double routes are closed below 4 players.</div>}
                        {blockedReason === 'taken' && <div>Already claimed.</div>}
                        {blockedReason === 'not-enough-trains' && <div>Not enough trains left.</div>}
                        {blockedReason === 'no-matching-cards' && <div>You can&apos;t cover this one yet.</div>}
                        {midDraw && <div>You&apos;ve already started drawing this turn.</div>}
                    </div>
                )}

                {selectedRoute && !blockedReason && !midDraw && (
                    <div className="ag-btn-row" style={{ marginBottom: 10 }}>
                        {payableColours(selectedRoute, hand).map(colour => (
                            <ActionButton
                                key={colour}
                                className="ag-btn ag-btn--primary ag-btn--block"
                                pending={pendingTarget === `claim-${colour}`}
                                pendingLabel="Claiming…"
                                onClick={() => claim(colour)}
                            >
                                Claim with {describePayment(buildPayment(selectedRoute, colour, hand))}
                            </ActionButton>
                        ))}
                    </div>
                )}

                <div className="ag-hand-head">
                    <span className="ag-hand-title">
                        {midDraw ? 'Take your second card' : 'Draw two cards'}
                    </span>
                    <span className="ag-hand-note">{gs.deckCount} in deck</span>
                </div>
                <div className="ag-chips">
                    {gs.market.map((colour, index) => {
                        // A face-up Engine costs the whole action, so it can only
                        // be taken as the first card of the turn (§5).
                        const engineBlocked = colour === 'engine' && midDraw;
                        return (
                            <ActionButton
                                key={index}
                                className={`ag-chip ag-tt-card${engineBlocked ? ' ag-tt-card--blocked' : ''}`}
                                disabled={engineBlocked}
                                pending={pendingTarget === `draw-market-${index}`}
                                pendingLabel="Taking…"
                                onClick={() => draw('market', index)}
                            >
                                <CardSwatch colour={colour} />
                                {CARD_LABEL[colour]}
                            </ActionButton>
                        );
                    })}
                </div>
                <ActionButton
                    className="ag-btn ag-btn--light ag-btn--block"
                    style={{ marginTop: 10 }}
                    disabled={deckEmpty}
                    pending={pendingTarget === 'draw-deck-0'}
                    pendingLabel="Drawing…"
                    onClick={() => draw('deck')}
                >
                    🂠 Draw from the deck
                </ActionButton>

                {nothingToDraw && (
                    <ActionButton
                        className="ag-btn ag-btn--ghost ag-btn--block"
                        style={{ marginTop: 10 }}
                        pending={pendingTarget === 'pass'}
                        pendingLabel="Passing…"
                        onClick={() => submitCommand(new TrainTimePassTurn(), undefined, 'pass')}
                    >
                        Pass — nothing left to draw
                    </ActionButton>
                )}

                <p className="ag-action-hint">
                    {midDraw
                        ? 'One more card and your turn ends.'
                        : 'Tap a highlighted route on the map to claim it, or draw two cards.'}
                </p>
            </div>
        </>
    );
}
