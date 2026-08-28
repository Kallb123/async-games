'use client'
import React, { useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import PendingTag from '@/components/ui/PendingTag';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
import type { IOutbreakSpecificGameStateResponse } from '@/games/Outbreak/apiModels';
import { CITIES, DISEASE_COLORS, DISEASE_COLOR_DEFS, eventCardName, isCityCardId, MAX_RESEARCH_STATIONS, OutbreakDiseaseColor } from '@/games/Outbreak/board';
import { HAND_LIMIT, OutbreakMoveType, cureCardsRequired, getLegalMoves, opsExpertBuildsFree, stationCityIds } from '@/games/Outbreak/rules';
import { OutbreakAction, OutbreakDiscard, OutbreakEndTurn } from '@/utils/apiModels/GameLogic';

const MOVE_DEFS: { type: OutbreakMoveType; icon: string; name: string; hint: string }[] = [
    { type: 'drive', icon: '🚗', name: 'Drive / Ferry', hint: 'Move to a connected city' },
    { type: 'directFlight', icon: '✈️', name: 'Direct Flight', hint: "Discard that city's card to fly there" },
    { type: 'charterFlight', icon: '🚀', name: 'Charter Flight', hint: "Discard this city's card to fly anywhere" },
    { type: 'shuttleFlight', icon: '🚉', name: 'Shuttle Flight', hint: 'Move between research stations' },
];

interface OutbreakActionsProps {
    gs: IOutbreakSpecificGameStateResponse;
    myUsername: string;
    /** The movement kind currently being targeted on the board, if any. */
    moveMode: OutbreakMoveType | null;
    setMoveMode: (m: OutbreakMoveType | null) => void;
    submitCommand: SubmitCommand;
    /** The `target` of the in-flight command, so only the tapped row shows as
     *  processing. Null when nothing is in flight. */
    pendingTarget: string | null;
}

export default function OutbreakActions({ gs, myUsername, moveMode, setMoveMode, submitCommand, pendingTarget }: OutbreakActionsProps) {
    const [relocating, setRelocating] = useState(false);
    const [discardChoice, setDiscardChoice] = useState<number[]>([]);

    const me = gs.playerStates[myUsername];
    if (!me) return null;

    function send(overrides: Partial<OutbreakAction>, target: string) {
        const cmd = new OutbreakAction();
        Object.assign(cmd, overrides);
        submitCommand(cmd, () => setRelocating(false), target);
    }

    // ── Over the hand limit (§9, §21.6 step 6): discard before anything else,
    //     including before the turn can end — OutbreakEndTurn already put the
    //     game in this phase and is waiting on OutbreakDiscard to close it. ──
    if (gs.phase === 'discard') {
        const mustDiscard = Math.max(0, me.hand.length - HAND_LIMIT);
        const enough = discardChoice.length >= mustDiscard;

        function toggle(cardId: number) {
            setDiscardChoice(prev => prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]);
        }

        return (
            <div className="ag-actionsheet">
                <p className="ag-action-hint" style={{ marginTop: 0 }}>
                    🗂 Discard {mustDiscard} card{mustDiscard === 1 ? '' : 's'} to get back to the {HAND_LIMIT}-card hand limit.
                </p>
                <div className="ag-build-list">
                    {me.hand.map(cardId => {
                        const selected = discardChoice.includes(cardId);
                        const isCity = isCityCardId(cardId);
                        return (
                            <button
                                key={cardId}
                                type="button"
                                className={`ag-build-row${selected ? ' ag-build-row--active' : ''}`}
                                onClick={() => toggle(cardId)}
                            >
                                <span className="ag-icon-box" style={{ background: isCity ? DISEASE_COLOR_DEFS[CITIES[cardId].color].hex : 'var(--ag-purple)' }}>
                                    {isCity ? '🗺️' : '🃏'}
                                </span>
                                <span className="ag-build-main">
                                    <span className="ag-build-name">{isCity ? CITIES[cardId].name : eventCardName(cardId)}</span>
                                </span>
                                <span className="ag-build-tag">{selected ? 'Discarding' : 'Keep'}</span>
                            </button>
                        );
                    })}
                </div>
                <ActionButton
                    className="ag-btn ag-btn--primary ag-btn--block"
                    style={{ marginTop: 10 }}
                    disabled={!enough}
                    pending={pendingTarget === 'discard'}
                    pendingLabel="Discarding…"
                    onClick={() => {
                        const cmd = new OutbreakDiscard();
                        cmd.cardIds = discardChoice;
                        submitCommand(cmd, () => setDiscardChoice([]), 'discard');
                    }}
                >
                    {enough ? `Discard ${discardChoice.length}` : `Pick at least ${mustDiscard}`}
                </ActionButton>
            </div>
        );
    }

    // ── Out of actions (§7 Phase 1 done): end the turn to draw and infect ──
    if (me.actionsLeft <= 0) {
        return (
            <div className="ag-actionsheet">
                <p className="ag-action-hint" style={{ marginTop: 0 }}>
                    ⏭ Out of actions — end your turn to draw 2 cards and infect.
                </p>
                <ActionButton
                    className="ag-btn ag-btn--primary ag-btn--block"
                    pending={pendingTarget === 'endTurn'}
                    pendingLabel="Ending turn…"
                    onClick={() => submitCommand(new OutbreakEndTurn(), undefined, 'endTurn')}
                >
                    End turn
                </ActionButton>
            </div>
        );
    }

    // ── A movement mode is active: the board is showing its destinations ────
    if (moveMode) {
        const def = MOVE_DEFS.find(d => d.type === moveMode)!;
        return (
            <div className="ag-actionsheet">
                <p className="ag-action-hint" style={{ marginTop: 0 }}>
                    {def.icon} <b>{def.name}</b> — tap a highlighted city on the map.
                </p>
                <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={() => setMoveMode(null)}>
                    ↩ Cancel
                </button>
            </div>
        );
    }

    const legalMoves = getLegalMoves({ currentCity: me.city, hand: me.hand, researchStations: stationCityIds(gs.cities) });
    const movesByType = new Map<OutbreakMoveType, number>();
    legalMoves.forEach(m => movesByType.set(m.type, (movesByType.get(m.type) ?? 0) + 1));

    const cityState = gs.cities[me.city];
    const stations = stationCityIds(gs.cities);
    const hasCityCard = me.hand.includes(me.city);
    const needsRelocate = stations.length >= MAX_RESEARCH_STATIONS;

    const treatable = DISEASE_COLORS.filter(color => cityState.cubes[color] > 0);
    const citymates = Object.values(gs.playerStates).filter(p => p.userId !== me.userId && p.city === me.city);
    const cureColors = DISEASE_COLORS.filter(color => gs.cures[color] === 'none' && me.hand.some(id => isCityCardId(id) && CITIES[id].color === color));
    const cureRequired = cureCardsRequired(me.role === 'scientist');
    const stationIsFree = opsExpertBuildsFree(me.role);

    return (
        <div className="ag-actionsheet">
            <div className="ag-build-list">
                {/* ── Movement ─────────────────────────────────────────────── */}
                {MOVE_DEFS.map(def => {
                    const count = movesByType.get(def.type) ?? 0;
                    const disabled = count === 0;
                    return (
                        <button
                            key={def.type}
                            type="button"
                            className={`ag-build-row${disabled ? ' ag-build-row--disabled' : ''}`}
                            disabled={disabled}
                            onClick={() => setMoveMode(def.type)}
                        >
                            <span className="ag-icon-box">{def.icon}</span>
                            <span className="ag-build-main">
                                <span className="ag-build-name">{def.name}</span>
                                <span className="ag-build-cost">{def.hint}</span>
                            </span>
                            {disabled
                                ? <span className="ag-build-tag ag-build-tag--muted">No targets</span>
                                : <span className="ag-build-tag">{count} {count === 1 ? 'city' : 'cities'}</span>}
                        </button>
                    );
                })}

                {/* ── Build a research station ────────────────────────────── */}
                {!cityState.station && (relocating ? (
                    <>
                        <div className="ag-callout">
                            All {MAX_RESEARCH_STATIONS} stations are placed — pick one to relocate to {CITIES[me.city].name}.
                        </div>
                        {stations.map(cityId => {
                            const target = `buildStation:${cityId}`;
                            const pending = pendingTarget === target;
                            return (
                                <button
                                    key={cityId}
                                    type="button"
                                    className={`ag-build-row${pending ? ' ag-pending-skin' : ''}`}
                                    onClick={() => send({ kind: 'buildStation', relocateFrom: cityId }, target)}
                                >
                                    <span className="ag-icon-box">🏥</span>
                                    <span className="ag-build-main">
                                        <span className="ag-build-name">{CITIES[cityId].name}</span>
                                    </span>
                                    {pending ? <PendingTag label="Relocating" /> : <span className="ag-build-tag">Relocate</span>}
                                </button>
                            );
                        })}
                        <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={() => setRelocating(false)}>↩ Cancel</button>
                    </>
                ) : (() => {
                    const pending = pendingTarget === 'buildStation';
                    const disabled = !stationIsFree && !hasCityCard;
                    return (
                        <button
                            type="button"
                            className={`ag-build-row${disabled ? ' ag-build-row--disabled' : ''}${pending ? ' ag-pending-skin' : ''}`}
                            disabled={disabled}
                            onClick={() => needsRelocate ? setRelocating(true) : send({ kind: 'buildStation', relocateFrom: null }, 'buildStation')}
                        >
                            <span className="ag-icon-box">🏥</span>
                            <span className="ag-build-main">
                                <span className="ag-build-name">Build a research station</span>
                                <span className="ag-build-cost">
                                    {stationIsFree
                                        ? (needsRelocate ? `Free, relocate one of ${MAX_RESEARCH_STATIONS}` : 'Free (Operations Expert)')
                                        : (needsRelocate ? `Discard ${CITIES[me.city].name}, relocate one of ${MAX_RESEARCH_STATIONS}` : `Discard ${CITIES[me.city].name}'s card`)}
                                </span>
                            </span>
                            {pending
                                ? <PendingTag label="Building" />
                                : disabled
                                    ? <span className="ag-build-tag ag-build-tag--muted">No card</span>
                                    : <span className="ag-build-tag">Build</span>}
                        </button>
                    );
                })())}

                {/* ── Treat disease ────────────────────────────────────────── */}
                {treatable.map(color => {
                    const cured = gs.cures[color] !== 'none';
                    const clearsAll = cured || me.role === 'medic';
                    const target = `treatDisease:${color}`;
                    const pending = pendingTarget === target;
                    return (
                        <button
                            key={color}
                            type="button"
                            className={`ag-build-row${pending ? ' ag-pending-skin' : ''}`}
                            onClick={() => send({ kind: 'treatDisease', color }, target)}
                        >
                            <span className="ag-icon-box" style={{ background: DISEASE_COLOR_DEFS[color].hex }}>💊</span>
                            <span className="ag-build-main">
                                <span className="ag-build-name">Treat {DISEASE_COLOR_DEFS[color].name}</span>
                                <span className="ag-build-cost">
                                    {clearsAll ? `Clears all ${cityState.cubes[color]} cubes here` : `Removes 1 of ${cityState.cubes[color]} cubes`}
                                </span>
                            </span>
                            {pending ? <PendingTag label="Treating" /> : <span className="ag-build-tag">Treat</span>}
                        </button>
                    );
                })}

                {/* ── Share knowledge ──────────────────────────────────────── */}
                {citymates.flatMap(mate => {
                    const rows: React.ReactNode[] = [];
                    if (hasCityCard) {
                        const target = `share:give:${mate.userId}`;
                        const pending = pendingTarget === target;
                        rows.push(
                            <button
                                key={target}
                                type="button"
                                className={`ag-build-row${pending ? ' ag-pending-skin' : ''}`}
                                onClick={() => send({ kind: 'shareKnowledge', targetUserId: mate.userId, direction: 'give' }, target)}
                            >
                                <span className="ag-icon-box">🤝</span>
                                <span className="ag-build-main">
                                    <span className="ag-build-name">Give {CITIES[me.city].name} card</span>
                                    <span className="ag-build-cost">to {mate.username}</span>
                                </span>
                                {pending ? <PendingTag label="Sharing" /> : <span className="ag-build-tag">Give</span>}
                            </button>,
                        );
                    }
                    if (mate.hand.includes(me.city)) {
                        const target = `share:take:${mate.userId}`;
                        const pending = pendingTarget === target;
                        rows.push(
                            <button
                                key={target}
                                type="button"
                                className={`ag-build-row${pending ? ' ag-pending-skin' : ''}`}
                                onClick={() => send({ kind: 'shareKnowledge', targetUserId: mate.userId, direction: 'take' }, target)}
                            >
                                <span className="ag-icon-box">🤝</span>
                                <span className="ag-build-main">
                                    <span className="ag-build-name">Take {CITIES[me.city].name} card</span>
                                    <span className="ag-build-cost">from {mate.username}</span>
                                </span>
                                {pending ? <PendingTag label="Sharing" /> : <span className="ag-build-tag">Take</span>}
                            </button>,
                        );
                    }
                    return rows;
                })}

                {/* ── Discover a cure ──────────────────────────────────────── */}
                {cureColors.map(color => {
                    const cardIds = me.hand.filter(id => isCityCardId(id) && CITIES[id].color === color).slice(0, cureRequired);
                    const atStation = cityState.station;
                    const disabled = !atStation || cardIds.length < cureRequired;
                    const target = `cure:${color}`;
                    const pending = pendingTarget === target;
                    return (
                        <button
                            key={color}
                            type="button"
                            className={`ag-build-row${disabled ? ' ag-build-row--disabled' : ''}${pending ? ' ag-pending-skin' : ''}`}
                            disabled={disabled}
                            onClick={() => send({ kind: 'cure', color, cardIds }, target)}
                        >
                            <span className="ag-icon-box" style={{ background: DISEASE_COLOR_DEFS[color].hex }}>🧪</span>
                            <span className="ag-build-main">
                                <span className="ag-build-name">Discover the {DISEASE_COLOR_DEFS[color].name} cure</span>
                                <span className="ag-build-cost">
                                    {atStation ? `${cardIds.length}/${cureRequired} cards` : 'Needs a research station here'}
                                </span>
                            </span>
                            {pending
                                ? <PendingTag label="Curing" />
                                : disabled
                                    ? <span className="ag-build-tag ag-build-tag--muted">{cardIds.length}/{cureRequired}</span>
                                    : <span className="ag-build-tag">Cure</span>}
                        </button>
                    );
                })}
            </div>

            <ActionButton
                className="ag-btn ag-btn--light ag-btn--block"
                style={{ marginTop: 10 }}
                pending={pendingTarget === 'pass'}
                pendingLabel="Forfeiting…"
                onClick={() => send({ kind: 'pass' }, 'pass')}
            >
                ⏭ Forfeit an action
            </ActionButton>
        </div>
    );
}
