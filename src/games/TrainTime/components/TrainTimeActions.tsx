'use client'
import React from 'react';
import type { ITrainTimeSpecificGameStateResponse } from '@/games/TrainTime/apiModels';
import {
    ROUTES,
    TICKETS_DRAWN_PER_TURN,
    TRAIN_TIME_CARD_COLOURS,
    TrainTimeCardColour,
    routeName,
} from '@/games/TrainTime/board';
import { CARD_LABEL, cardFaceStyle } from '@/games/TrainTime/ui';
import ActionButton from '@/components/ui/ActionButton';
import { pluralize } from '@/utils/ui/text';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
import { TrainTimeDrawCarriageCard, TrainTimePassTurn } from '@/utils/apiModels/GameLogic';

const HAND_ORDER: TrainTimeCardColour[] = [...TRAIN_TIME_CARD_COLOURS, 'engine'];

/** The turn's one action: cards, track or tickets (§5). */
export type TrainTimeAction = 'draw' | 'claim' | 'tickets';

interface TrainTimeActionsProps {
    gs: ITrainTimeSpecificGameStateResponse;
    myUserId: string;
    action: TrainTimeAction;
    setAction: (action: TrainTimeAction) => void;
    /** The route tapped on the map, if any. */
    selectedRouteId: number | null;
    /** Opens the claim sheet for the selected route. */
    onClaim: () => void;
    claimableCount: number;
    /** Fires Action C — draw three tickets and keep at least one. */
    onDrawTickets: () => void;
    submitCommand: SubmitCommand;
    pendingTarget: string | null;
}

/**
 * The active player's turn sheet: the face-up row, their hand, and the
 * one-action picker beneath it. Exactly one of the three actions happens per
 * turn (design doc §5), so the picker chooses which and the single big button
 * commits it.
 */
export default function TrainTimeActions({
    gs, myUserId, action, setAction, selectedRouteId, onClaim, claimableCount, onDrawTickets,
    submitCommand, pendingTarget,
}: TrainTimeActionsProps) {
    const me = gs.playerStates[myUserId];
    if (!me) return null;

    const hand = gs.myHand;
    // A draw is one action across two commands: once it's started, the turn is
    // committed to drawing.
    const midDraw = gs.myDrawsThisTurn > 0;
    const deckEmpty = gs.deckCount === 0 && gs.discardCount === 0;
    const nothingToDraw = deckEmpty && gs.market.length === 0;
    const selectedRoute = selectedRouteId === null ? null : ROUTES[selectedRouteId];
    // Once a draw has started the turn is committed to it, whatever the
    // picker last had selected.
    const chosen: TrainTimeAction = midDraw ? 'draw' : action;
    const ticketsLeft = Math.min(TICKETS_DRAWN_PER_TURN, gs.ticketDeckCount);

    function draw(source: 'deck' | 'market', marketIndex = 0) {
        const command = new TrainTimeDrawCarriageCard();
        command.source = source;
        command.marketIndex = marketIndex;
        submitCommand(command, undefined, `draw-${source}-${marketIndex}`);
    }

    return (
        <>
            <div className="ag-hand">
                <div className="ag-hand-head">
                    <span className="ag-hand-title">{midDraw ? 'Pick 2 · one more card' : 'Face up · take 2'}</span>
                    {/* The supply counts, the one place they're shown: how
                        deep the carriage deck still is, and whether Action C
                        has any tickets left to offer. */}
                    <span className="ag-hand-note">
                        deck {gs.deckCount} · discard {gs.discardCount} · 🎫 {gs.ticketDeckCount}
                    </span>
                </div>
                <div className="ag-tt-market">
                    {gs.market.map((colour, index) => {
                        // A face-up Engine costs the whole action, so it can
                        // only ever be the first card of the turn (§5).
                        const engineBlocked = colour === 'engine' && midDraw;
                        return (
                            <button
                                key={index}
                                type="button"
                                className={`ag-tt-card${colour === 'engine' ? ' ag-tt-card--engine' : ''}`}
                                style={cardFaceStyle(colour)}
                                disabled={engineBlocked || pendingTarget !== null}
                                onClick={() => draw('market', index)}
                            >
                                {CARD_LABEL[colour]}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        className="ag-tt-card ag-tt-card--deck"
                        disabled={deckEmpty || pendingTarget !== null}
                        onClick={() => draw('deck')}
                        aria-label="Draw a card blind from the deck"
                    >
                        ?
                    </button>
                </div>
                <p className="ag-action-hint">
                    {midDraw
                        ? 'A Loco can’t be the second pick — it costs a whole turn.'
                        : 'Tap a card, or the deck for a blind draw. Taking a face-up Loco ends the turn there.'}
                </p>
            </div>

            <div className="ag-hand">
                <div className="ag-hand-head">
                    <span className="ag-hand-title">Your hand · {hand.length}</span>
                    {midDraw
                        ? <span className="ag-hand-note">one more card ends your turn</span>
                        : selectedRoute
                            ? <span className="ag-tt-payable">✓ {routeName(selectedRoute)} payable</span>
                            : <span className="ag-hand-note">{pluralize(claimableCount, 'route')} claimable</span>}
                </div>
                <div className="ag-tt-hand">
                    {HAND_ORDER.filter(colour => hand.includes(colour)).map(colour => {
                        const count = hand.filter(c => c === colour).length;
                        return (
                            <div key={colour} className="ag-tt-hand-stack ag-cascade">
                                {Array.from({ length: count }, (_, i) => {
                                    const isTop = i === count - 1;
                                    return (
                                        <div key={i} className="ag-tt-hand-card" style={cardFaceStyle(colour)}>
                                            {isTop && (colour === 'engine' ? `◆${count}` : `${CARD_LABEL[colour]} ×${count}`)}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                    {hand.length === 0 && <span className="ag-hand-note">No cards yet — draw two.</span>}
                </div>
            </div>

            <div className="ag-actionsheet">
                <div className="ag-tt-actions">
                    <button
                        type="button"
                        className={`ag-tt-action${chosen === 'draw' ? ' ag-tt-action--on' : ''}`}
                        disabled={nothingToDraw}
                        onClick={() => setAction('draw')}
                    >
                        <div className="ag-tt-action-glyph">🃏</div>
                        Draw cards
                    </button>
                    <button
                        type="button"
                        className={`ag-tt-action${chosen === 'claim' ? ' ag-tt-action--on' : ''}`}
                        disabled={midDraw || claimableCount === 0}
                        onClick={() => setAction('claim')}
                    >
                        <div className="ag-tt-action-glyph">🚂</div>
                        Claim route
                    </button>
                    <button
                        type="button"
                        className={`ag-tt-action${chosen === 'tickets' ? ' ag-tt-action--on' : ''}`}
                        disabled={midDraw || ticketsLeft === 0}
                        onClick={() => setAction('tickets')}
                    >
                        <div className="ag-tt-action-glyph">🎫</div>
                        Draw tickets
                    </button>
                </div>

                <div className="ag-btn-row" style={{ marginTop: 9 }}>
                    {chosen === 'tickets' ? (
                        <ActionButton
                            className="ag-btn ag-btn--primary ag-btn--block"
                            pending={pendingTarget === 'tickets'}
                            pendingLabel="Drawing…"
                            onClick={onDrawTickets}
                        >
                            Draw {pluralize(ticketsLeft, 'ticket')} →
                        </ActionButton>
                    ) : chosen === 'draw' ? (
                        <ActionButton
                            className="ag-btn ag-btn--primary ag-btn--block"
                            disabled={deckEmpty}
                            pending={pendingTarget === 'draw-deck-0'}
                            pendingLabel="Drawing…"
                            onClick={() => draw('deck')}
                        >
                            Draw from the deck →
                        </ActionButton>
                    ) : (
                        <button
                            type="button"
                            className={`ag-btn ${selectedRoute ? 'ag-btn--primary' : 'ag-btn--light'} ag-btn--block`}
                            disabled={!selectedRoute}
                            onClick={onClaim}
                        >
                            {selectedRoute ? `Claim ${routeName(selectedRoute)} →` : 'Tap a highlighted route'}
                        </button>
                    )}
                </div>

                {nothingToDraw && (
                    <ActionButton
                        className="ag-btn ag-btn--light ag-btn--block"
                        style={{ marginTop: 10 }}
                        pending={pendingTarget === 'pass'}
                        pendingLabel="Passing…"
                        onClick={() => submitCommand(new TrainTimePassTurn(), undefined, 'pass')}
                    >
                        Pass — nothing left to draw
                    </ActionButton>
                )}
            </div>
        </>
    );
}
