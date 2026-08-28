'use client'
import React, { useState } from 'react';
import PendingTag from '@/components/ui/PendingTag';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
import type { IOutbreakSpecificGameStateResponse } from '@/games/Outbreak/apiModels';
import {
    CITIES,
    EVENT_CARDS,
    EVENT_CARD_AIRLIFT,
    EVENT_CARD_GOVERNMENT_GRANT,
    EVENT_CARD_ONE_QUIET_NIGHT,
    EVENT_CARD_FORECAST,
    EVENT_CARD_RESILIENT_POPULATION,
    MAX_RESEARCH_STATIONS,
    cardColor,
    cardName,
    isEventCardId,
} from '@/games/Outbreak/board';
import { stationCityIds } from '@/games/Outbreak/rules';
import { OutbreakPlayEvent } from '@/utils/apiModels/GameLogic';

// A board-targeted event still in progress — lifted to the page (like
// movement's moveMode) because only the page owns the map's click handler.
// Airlift needs a teammate picked before the map lights up; Government
// Grant's destination is picked on the map directly, and only *then* — if
// all six stations are already down — needs the relocate-from step below,
// which the tray itself renders as a plain list.
export type OutbreakEventTargeting =
    | { cardId: typeof EVENT_CARD_AIRLIFT; kind: 'airlift'; targetUserId?: string }
    | { cardId: typeof EVENT_CARD_GOVERNMENT_GRANT; kind: 'governmentGrant'; destination?: number };

interface OutbreakEventTrayProps {
    gs: IOutbreakSpecificGameStateResponse;
    myUsername: string;
    usernameList: string[];
    submitCommand: SubmitCommand;
    pendingTarget: string | null;
    targeting: OutbreakEventTargeting | null;
    onStartTargeting: (t: OutbreakEventTargeting) => void;
    onCancelTargeting: () => void;
}

// The shell every sub-picker below shares: a hint (plain instruction or a
// `ag-callout` warning), an optional list of choices, and a way out. Four of
// this tray's five branches are exactly this shape with different rows —
// extracted once they hit that count, per AGENTS.md's "second copy" rule.
function PickerSheet({ hint, onCancel, children }: { hint: React.ReactNode; onCancel: () => void; children?: React.ReactNode }) {
    return (
        <div className="ag-actionsheet">
            {hint}
            {children && <div className="ag-build-list">{children}</div>}
            <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={onCancel}>↩ Cancel</button>
        </div>
    );
}

/**
 * The event-card tray (§21.6 step 11): everywhere a player's five one-shot
 * cards (§12) get played from, own-turn-only per §21.3. Distinct from the
 * hand panel above — that one just shows what everybody's holding; this one
 * is the only place a card actually leaves a hand outside the ordinary
 * action list, which is why it's its own component rather than more rows in
 * `OutbreakActions`. The Contingency Planner's retrieval lives here too,
 * since it's the same "do something with an event card" concern, even
 * though — unlike playing one — it costs an action.
 */
export default function OutbreakEventTray({
    gs, myUsername, usernameList, submitCommand, pendingTarget, targeting, onStartTargeting, onCancelTargeting,
}: OutbreakEventTrayProps) {
    const [pickingAirliftTarget, setPickingAirliftTarget] = useState(false);
    const [pickingResilientPopulation, setPickingResilientPopulation] = useState(false);
    const [pickingRetrieve, setPickingRetrieve] = useState(false);

    const me = gs.playerStates[myUsername];
    if (!me) return null;

    function send(cmd: OutbreakPlayEvent, target: string) {
        submitCommand(cmd, () => {
            setPickingAirliftTarget(false);
            setPickingResilientPopulation(false);
            setPickingRetrieve(false);
            onCancelTargeting();
        }, target);
    }

    function playImmediately(cardId: number) {
        const cmd = new OutbreakPlayEvent();
        cmd.kind = 'play';
        cmd.cardId = cardId;
        send(cmd, `event:play:${cardId}`);
    }

    // ── A board-targeted play is already in progress: the tray shows the
    //     relocate step (Government Grant, at the 6-station cap) or the
    //     "tap the map" hint, and nothing else, until it's resolved. ──
    if (targeting) {
        if (targeting.kind === 'governmentGrant' && targeting.destination !== undefined) {
            const destination = targeting.destination;
            const stations = stationCityIds(gs.cities);
            return (
                <PickerSheet
                    hint={
                        <div className="ag-callout">
                            All {MAX_RESEARCH_STATIONS} stations are placed — pick one to relocate to {CITIES[destination].name}.
                        </div>
                    }
                    onCancel={onCancelTargeting}
                >
                    {stations.map(cityId => {
                        const target = `event:governmentGrant:${cityId}`;
                        const pending = pendingTarget === target;
                        return (
                            <button
                                key={cityId}
                                type="button"
                                className={`ag-build-row${pending ? ' ag-pending-skin' : ''}`}
                                onClick={() => {
                                    const cmd = new OutbreakPlayEvent();
                                    cmd.kind = 'play';
                                    cmd.cardId = EVENT_CARD_GOVERNMENT_GRANT;
                                    cmd.destination = destination;
                                    cmd.relocateFrom = cityId;
                                    send(cmd, target);
                                }}
                            >
                                <span className="ag-icon-box">🏥</span>
                                <span className="ag-build-main">
                                    <span className="ag-build-name">{CITIES[cityId].name}</span>
                                </span>
                                {pending ? <PendingTag label="Relocating" /> : <span className="ag-build-tag">Relocate</span>}
                            </button>
                        );
                    })}
                </PickerSheet>
            );
        }

        const hint = targeting.kind === 'airlift'
            ? '✈️ Airlift — tap a highlighted city on the map.'
            : '🏥 Government Grant — tap a highlighted city on the map.';
        return <PickerSheet hint={<p className="ag-action-hint" style={{ marginTop: 0 }}>{hint}</p>} onCancel={onCancelTargeting} />;
    }

    // ── Picking who Airlift moves ────────────────────────────────────────
    if (pickingAirliftTarget) {
        return (
            <PickerSheet
                hint={<p className="ag-action-hint" style={{ marginTop: 0 }}>✈️ Airlift — whose pawn moves?</p>}
                onCancel={() => setPickingAirliftTarget(false)}
            >
                {usernameList.flatMap(username => {
                    const p = gs.playerStates[username];
                    if (!p) return [];
                    return [
                        <button
                            key={username}
                            type="button"
                            className="ag-build-row"
                            onClick={() => {
                                setPickingAirliftTarget(false);
                                onStartTargeting({ cardId: EVENT_CARD_AIRLIFT, kind: 'airlift', targetUserId: p.userId });
                            }}
                        >
                            <span className="ag-icon-box">🧑‍⚕️</span>
                            <span className="ag-build-main">
                                <span className="ag-build-name">{username === myUsername ? 'You' : username}</span>
                                <span className="ag-build-cost">{CITIES[p.city].name}</span>
                            </span>
                            <span className="ag-build-tag">Pick</span>
                        </button>,
                    ];
                })}
            </PickerSheet>
        );
    }

    // ── Resilient Population: pick one card out of the infection discard ──
    if (pickingResilientPopulation) {
        return (
            <PickerSheet
                hint={<p className="ag-action-hint" style={{ marginTop: 0 }}>🧬 Resilient Population — remove which card, permanently?</p>}
                onCancel={() => setPickingResilientPopulation(false)}
            >
                {gs.infectionDiscard.map((cityId, i) => {
                    const target = `event:resilientPopulation:${i}`;
                    const pending = pendingTarget === target;
                    return (
                        <button
                            key={`${cityId}-${i}`}
                            type="button"
                            className={`ag-build-row${pending ? ' ag-pending-skin' : ''}`}
                            onClick={() => {
                                const cmd = new OutbreakPlayEvent();
                                cmd.kind = 'play';
                                cmd.cardId = EVENT_CARD_RESILIENT_POPULATION;
                                cmd.infectionCardId = cityId;
                                send(cmd, target);
                            }}
                        >
                            <span className="ag-icon-box" style={{ background: cardColor(cityId) }}>🗺️</span>
                            <span className="ag-build-main">
                                <span className="ag-build-name">{cardName(cityId)}</span>
                            </span>
                            {pending ? <PendingTag label="Removing" /> : <span className="ag-build-tag">Remove</span>}
                        </button>
                    );
                })}
                {gs.infectionDiscard.length === 0 && <p className="ag-action-hint">The infection discard pile is empty.</p>}
            </PickerSheet>
        );
    }

    // ── Contingency Planner: retrieve a discarded event card ─────────────
    const retrievableCards = gs.playerDiscard.filter(isEventCardId);
    if (pickingRetrieve) {
        return (
            <PickerSheet
                hint={<p className="ag-action-hint" style={{ marginTop: 0 }}>🗃 Retrieve which discarded event card?</p>}
                onCancel={() => setPickingRetrieve(false)}
            >
                {retrievableCards.map((cardId, i) => {
                    const target = `event:retrieve:${i}`;
                    const pending = pendingTarget === target;
                    return (
                        <button
                            key={`${cardId}-${i}`}
                            type="button"
                            className={`ag-build-row${pending ? ' ag-pending-skin' : ''}`}
                            onClick={() => {
                                const cmd = new OutbreakPlayEvent();
                                cmd.kind = 'retrieve';
                                cmd.cardId = cardId;
                                send(cmd, target);
                            }}
                        >
                            <span className="ag-icon-box" style={{ background: cardColor(cardId) }}>🃏</span>
                            <span className="ag-build-main">
                                <span className="ag-build-name">{cardName(cardId)}</span>
                            </span>
                            {pending ? <PendingTag label="Retrieving" /> : <span className="ag-build-tag">Retrieve</span>}
                        </button>
                    );
                })}
            </PickerSheet>
        );
    }

    // ── The tray itself: every event card this player can play right now ──
    const playable = [...me.hand.filter(isEventCardId), ...(me.contingencyCard !== null ? [me.contingencyCard] : [])];
    const canRetrieve = me.role === 'contingencyPlanner' && me.contingencyCard === null && me.actionsLeft > 0 && retrievableCards.length > 0
        && gs.phase === 'actions';

    if (playable.length === 0 && !canRetrieve) return null;

    return (
        <div className="ag-hand">
            <div className="ag-hand-head">
                <span className="ag-hand-title">Event cards</span>
            </div>
            <div className="ag-build-list">
                {playable.map(cardId => {
                    const effect = EVENT_CARDS.find(c => c.id === cardId)?.effect ?? '';
                    const target = `event:play:${cardId}`;
                    const pending = pendingTarget === target;
                    return (
                        <button
                            key={cardId}
                            type="button"
                            className={`ag-build-row${pending ? ' ag-pending-skin' : ''}`}
                            onClick={() => {
                                if (cardId === EVENT_CARD_AIRLIFT) setPickingAirliftTarget(true);
                                else if (cardId === EVENT_CARD_GOVERNMENT_GRANT) onStartTargeting({ cardId: EVENT_CARD_GOVERNMENT_GRANT, kind: 'governmentGrant' });
                                else if (cardId === EVENT_CARD_RESILIENT_POPULATION) setPickingResilientPopulation(true);
                                else if (cardId === EVENT_CARD_ONE_QUIET_NIGHT || cardId === EVENT_CARD_FORECAST) playImmediately(cardId);
                            }}
                        >
                            <span className="ag-icon-box" style={{ background: cardColor(cardId) }}>🃏</span>
                            <span className="ag-build-main">
                                <span className="ag-build-name">{cardName(cardId)}</span>
                                <span className="ag-build-cost">{effect}</span>
                            </span>
                            {pending ? <PendingTag label="Playing" /> : <span className="ag-build-tag">Play</span>}
                        </button>
                    );
                })}
                {canRetrieve && (
                    <button type="button" className="ag-build-row" onClick={() => setPickingRetrieve(true)}>
                        <span className="ag-icon-box">🗃</span>
                        <span className="ag-build-main">
                            <span className="ag-build-name">Retrieve an event card</span>
                            <span className="ag-build-cost">Costs an action</span>
                        </span>
                        <span className="ag-build-tag">Retrieve</span>
                    </button>
                )}
            </div>
        </div>
    );
}
