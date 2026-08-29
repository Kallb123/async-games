'use client'
import React, { useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import PendingTag from '@/components/ui/PendingTag';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
import type { IOutbreakSpecificGameStateResponse } from '@/games/Outbreak/apiModels';
import { CITIES, DISEASE_COLORS, DISEASE_COLOR_DEFS, MAX_RESEARCH_STATIONS, OutbreakDiseaseColor, OutbreakRoleId, cardColor, cardName, isCityCardId, roleDef } from '@/games/Outbreak/board';
import { HAND_LIMIT, OutbreakMoveType, cureCardsRequired, getLegalMoves, opsExpertBuildsFree, stationCityIds } from '@/games/Outbreak/rules';
import { OutbreakAction, OutbreakDiscard, OutbreakEndTurn, OutbreakPlayEvent } from '@/utils/apiModels/GameLogic';
import { useResettingState } from '@/utils/hooks/useResettingState';

const MOVE_DEFS: { type: OutbreakMoveType; icon: string; name: string; hint: string }[] = [
    { type: 'drive', icon: '🚗', name: 'Drive / Ferry', hint: 'Move to a connected city' },
    { type: 'directFlight', icon: '✈️', name: 'Direct Flight', hint: "Discard that city's card to fly there" },
    { type: 'charterFlight', icon: '🚀', name: 'Charter Flight', hint: "Discard this city's card to fly anywhere" },
    { type: 'shuttleFlight', icon: '🚉', name: 'Shuttle Flight', hint: 'Move between research stations' },
];

// The "pick one city card from a list" sheet shared by the two abilities that
// need it: the Operations Expert choosing which card pays for her flight, and
// the Researcher choosing which non-matching card to give or take (§11). Both
// are a hint, a list of city-card rows, and a way out — extracted once the
// second one appeared, per AGENTS.md's "second copy" rule.
function CardPickerSheet({ hint, cards, tagLabel, onPick, onCancel }: {
    hint: string;
    cards: number[];
    tagLabel: string;
    onPick: (cardId: number) => void;
    onCancel: () => void;
}) {
    return (
        <div className="ag-actionsheet">
            <p className="ag-action-hint" style={{ marginTop: 0 }}>{hint}</p>
            <div className="ag-build-list">
                {cards.map(cardId => (
                    <button
                        key={cardId}
                        type="button"
                        className="ag-build-row"
                        onClick={() => onPick(cardId)}
                    >
                        <span className="ag-icon-box" style={{ background: cardColor(cardId) }}>🗺️</span>
                        <span className="ag-build-main">
                            <span className="ag-build-name">{cardName(cardId)}</span>
                        </span>
                        <span className="ag-build-tag">{tagLabel}</span>
                    </button>
                ))}
            </div>
            <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={onCancel}>↩ Cancel</button>
        </div>
    );
}

// The four movement rows (§8.1), shown both in the main action list (moving
// my own pawn) and in the Dispatcher's move-a-teammate picker (§11) — the two
// differ only in whose city the legal-move counts were computed against and
// what tapping a row starts, so the row markup lives here once.
function MoveTypeRows({ movesByType, onPick }: {
    movesByType: Map<OutbreakMoveType, number>;
    onPick: (type: OutbreakMoveType) => void;
}) {
    return (
        <>
            {MOVE_DEFS.map(def => {
                const count = movesByType.get(def.type) ?? 0;
                const disabled = count === 0;
                return (
                    <button
                        key={def.type}
                        type="button"
                        className={`ag-build-row${disabled ? ' ag-build-row--disabled' : ''}`}
                        disabled={disabled}
                        onClick={() => onPick(def.type)}
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
        </>
    );
}

// The "pick a pawn" sheet the Dispatcher's two abilities share (§11): whose
// pawn to move with her hand, and which pawn to send to a shared city. Each
// row names a player and the city their pawn stands in.
function PlayerPickerSheet({ hint, players, tagLabel, onPick, onCancel }: {
    hint: string;
    players: { userId: string; username: string; city: number; role: OutbreakRoleId | null }[];
    tagLabel: string;
    onPick: (userId: string) => void;
    onCancel: () => void;
}) {
    return (
        <div className="ag-actionsheet">
            <p className="ag-action-hint" style={{ marginTop: 0 }}>{hint}</p>
            <div className="ag-build-list">
                {players.map(p => (
                    <button
                        key={p.userId}
                        type="button"
                        className="ag-build-row"
                        onClick={() => onPick(p.userId)}
                    >
                        <span className="ag-icon-box">🧑‍⚕️</span>
                        <span className="ag-build-main">
                            <span className="ag-build-name">{p.username}</span>
                            <span className="ag-build-cost">{[roleDef(p.role)?.name, CITIES[p.city].name].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="ag-build-tag">{tagLabel}</span>
                    </button>
                ))}
            </div>
            <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={onCancel}>↩ Cancel</button>
        </div>
    );
}

interface OutbreakActionsProps {
    gs: IOutbreakSpecificGameStateResponse;
    myUsername: string;
    /** The movement kind currently being targeted on the board, if any. */
    moveMode: OutbreakMoveType | null;
    setMoveMode: (m: OutbreakMoveType | null) => void;
    /** Operations Expert (§11): true while her station-to-anywhere flight is
     *  picking a destination on the map (the card is already chosen). */
    opsFlightActive: boolean;
    /** Begin that flight with the given city card chosen to pay for it. */
    onStartOpsFlight: (cardId: number) => void;
    /** Dispatcher (§11): the pawn whose destination is being picked on the map
     *  right now, and which of her two abilities is driving it — null when no
     *  Dispatcher-driven board target is active. */
    dispatchBoard: { moverUserId: string; mode: 'move' | 'relocate' } | null;
    /** Begin moving `moverUserId`'s pawn by `type`, paying from my hand. */
    onStartDispatchMove: (type: OutbreakMoveType, moverUserId: string) => void;
    /** Begin sending `moverUserId`'s pawn to a city another pawn occupies. */
    onStartDispatchRelocate: (moverUserId: string) => void;
    /** Clear any actions-driven board target (ops flight or either Dispatcher
     *  ability) — the page owns the map, so cancelling it lives up there. */
    onCancelBoardTarget: () => void;
    submitCommand: SubmitCommand;
    /** The `target` of the in-flight command, so only the tapped row shows as
     *  processing. Null when nothing is in flight. */
    pendingTarget: string | null;
}

export default function OutbreakActions({ gs, myUsername, moveMode, setMoveMode, opsFlightActive, onStartOpsFlight, dispatchBoard, onStartDispatchMove, onStartDispatchRelocate, onCancelBoardTarget, submitCommand, pendingTarget }: OutbreakActionsProps) {
    const [relocating, setRelocating] = useState(false);
    // Operations Expert (§11): picking which city card pays for her flight,
    // before the map lights up for the destination.
    const [pickingOpsFlight, setPickingOpsFlight] = useState(false);
    // Researcher (§11): the teammate and direction of a non-matching Share
    // Knowledge in progress, while she picks which card actually moves.
    const [shareChoice, setShareChoice] = useState<{ userId: string; username: string; direction: 'give' | 'take' } | null>(null);
    // Dispatcher (§11): which of her two abilities is mid-setup, and — for the
    // move ability — whose pawn has been chosen, before the move type. The
    // final destination is picked on the map (dispatchBoard, above).
    const [dispatch, setDispatch] = useState<
        | { stage: 'moveWho' }
        | { stage: 'moveType'; moverUserId: string }
        | { stage: 'relocateWho' }
        | null
    >(null);
    const [discardChoice, setDiscardChoice] = useState<number[]>([]);
    // Forecast's ordering step (§12, §21.6 step 11): starts at the drawn order
    // every time a *new* draw arrives, keyed off the cards themselves rather
    // than a phase transition, since the phase stays 'forecast' the whole step.
    const [forecastOrder, setForecastOrder] = useResettingState<number[]>(gs.forecastCards, gs.forecastCards.join(','));

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
                        return (
                            <button
                                key={cardId}
                                type="button"
                                className={`ag-build-row${selected ? ' ag-build-row--active' : ''}`}
                                onClick={() => toggle(cardId)}
                            >
                                <span className="ag-icon-box" style={{ background: cardColor(cardId) }}>
                                    {isCityCardId(cardId) ? '🗺️' : '🃏'}
                                </span>
                                <span className="ag-build-main">
                                    <span className="ag-build-name">{cardName(cardId)}</span>
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

    // ── Forecast's ordering step (§12, §21.6 step 10): blocks everything else
    //     until the drawn cards go back down in a chosen order (§21.3). ──
    if (gs.phase === 'forecast') {
        function move(i: number, dir: -1 | 1) {
            const j = i + dir;
            if (j < 0 || j >= forecastOrder.length) return;
            const next = [...forecastOrder];
            [next[i], next[j]] = [next[j], next[i]];
            setForecastOrder(next);
        }

        return (
            <div className="ag-actionsheet">
                <p className="ag-action-hint" style={{ marginTop: 0 }}>
                    🔮 Forecast — rearrange the top {forecastOrder.length} infection cards, then return them face-down.
                </p>
                <div className="ag-build-list">
                    {forecastOrder.map((cityId, i) => (
                        <div key={`${cityId}-${i}`} className="ag-build-row">
                            <span className="ag-icon-box" style={{ background: cardColor(cityId) }}>🗺️</span>
                            <span className="ag-build-main">
                                <span className="ag-build-name">{i + 1}. {cardName(cityId)}</span>
                            </span>
                            <span style={{ display: 'flex', gap: 4 }}>
                                <button type="button" className="ag-btn ag-btn--light" style={{ padding: '4px 9px' }} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${cardName(cityId)} earlier`}>↑</button>
                                <button type="button" className="ag-btn ag-btn--light" style={{ padding: '4px 9px' }} disabled={i === forecastOrder.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${cardName(cityId)} later`}>↓</button>
                            </span>
                        </div>
                    ))}
                </div>
                <ActionButton
                    className="ag-btn ag-btn--primary ag-btn--block"
                    style={{ marginTop: 10 }}
                    pending={pendingTarget === 'forecastOrder'}
                    pendingLabel="Confirming…"
                    onClick={() => {
                        const cmd = new OutbreakPlayEvent();
                        cmd.kind = 'forecastOrder';
                        cmd.cardIds = forecastOrder;
                        submitCommand(cmd, undefined, 'forecastOrder');
                    }}
                >
                    Confirm order
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

    // ── Operations Expert flight, step 2 (§11): the card is chosen, the board
    //     is lit up for the destination — tap a city there to fly. ──────────
    if (opsFlightActive) {
        return (
            <div className="ag-actionsheet">
                <p className="ag-action-hint" style={{ marginTop: 0 }}>
                    🛩 <b>Operations Expert flight</b> — tap a highlighted city on the map.
                </p>
                <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={onCancelBoardTarget}>
                    ↩ Cancel
                </button>
            </div>
        );
    }

    // ── Operations Expert flight, step 1 (§11): pick which city card to
    //     discard, then hand off to the map for the destination. ────────────
    if (pickingOpsFlight) {
        return (
            <CardPickerSheet
                hint="🛩 Operations Expert flight — discard which city card?"
                cards={me.hand.filter(isCityCardId)}
                tagLabel="Discard"
                onPick={cardId => { setPickingOpsFlight(false); onStartOpsFlight(cardId); }}
                onCancel={() => setPickingOpsFlight(false)}
            />
        );
    }

    // ── Researcher Share Knowledge (§11): pick which of the giver's city
    //     cards moves — hers to give, or hers for a teammate to take. ───────
    if (shareChoice) {
        const mate = Object.values(gs.playerStates).find(p => p.userId === shareChoice.userId);
        if (mate) {
            const giverHand = shareChoice.direction === 'give' ? me.hand : mate.hand;
            return (
                <CardPickerSheet
                    hint={shareChoice.direction === 'give'
                        ? `🤝 Give which card to ${shareChoice.username}?`
                        : `🤝 Take which card from ${shareChoice.username}?`}
                    cards={giverHand.filter(isCityCardId)}
                    tagLabel={shareChoice.direction === 'give' ? 'Give' : 'Take'}
                    onPick={cardId => {
                        const cmd = new OutbreakAction();
                        Object.assign(cmd, { kind: 'shareKnowledge', targetUserId: shareChoice.userId, direction: shareChoice.direction, cardId });
                        submitCommand(cmd, () => setShareChoice(null), `share:${shareChoice.direction}:${shareChoice.userId}`);
                    }}
                    onCancel={() => setShareChoice(null)}
                />
            );
        }
    }

    // ── Dispatcher (§11), destination step: a pawn is chosen and the board is
    //     lit for its destination — tap a city there. ─────────────────────────
    if (dispatchBoard) {
        const mover = Object.values(gs.playerStates).find(p => p.userId === dispatchBoard.moverUserId);
        const moverName = mover ? (mover.userId === me.userId ? 'your' : `${mover.username}'s`) : 'the';
        return (
            <div className="ag-actionsheet">
                <p className="ag-action-hint" style={{ marginTop: 0 }}>
                    🧭 <b>Dispatcher</b> — tap a highlighted city to {dispatchBoard.mode === 'move' ? `move ${moverName} pawn` : `send ${moverName} pawn there`}.
                </p>
                <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={onCancelBoardTarget}>
                    ↩ Cancel
                </button>
            </div>
        );
    }

    // ── Dispatcher move, step 1 (§11): whose pawn to move with my hand. ──────
    if (dispatch?.stage === 'moveWho') {
        const others = Object.values(gs.playerStates).filter(p => p.userId !== me.userId);
        return (
            <PlayerPickerSheet
                hint="🧭 Dispatcher — whose pawn do you want to move?"
                players={others}
                tagLabel="Move"
                onPick={moverUserId => setDispatch({ stage: 'moveType', moverUserId })}
                onCancel={() => setDispatch(null)}
            />
        );
    }

    // ── Dispatcher move, step 2 (§11): how that pawn travels — legal moves are
    //     computed from the *mover's* city but paid from my hand. ─────────────
    if (dispatch?.stage === 'moveType') {
        const mover = Object.values(gs.playerStates).find(p => p.userId === dispatch.moverUserId);
        if (mover) {
            const moverMoves = getLegalMoves({ currentCity: mover.city, hand: me.hand, researchStations: stationCityIds(gs.cities) });
            const moverByType = new Map<OutbreakMoveType, number>();
            moverMoves.forEach(m => moverByType.set(m.type, (moverByType.get(m.type) ?? 0) + 1));
            return (
                <div className="ag-actionsheet">
                    <p className="ag-action-hint" style={{ marginTop: 0 }}>
                        🧭 Dispatcher — how does {mover.username}&apos;s pawn travel? (Paid from your hand.)
                    </p>
                    <div className="ag-build-list">
                        <MoveTypeRows movesByType={moverByType} onPick={type => { setDispatch(null); onStartDispatchMove(type, dispatch.moverUserId); }} />
                    </div>
                    <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={() => setDispatch(null)}>↩ Cancel</button>
                </div>
            );
        }
    }

    // ── Dispatcher relocate (§11): which pawn to send to a city another pawn
    //     already occupies — no card, no adjacency, just an action. ───────────
    if (dispatch?.stage === 'relocateWho') {
        const everyone = Object.values(gs.playerStates).map(p => ({ userId: p.userId, username: p.userId === me.userId ? 'You' : p.username, city: p.city, role: p.role }));
        return (
            <PlayerPickerSheet
                hint="🧭 Dispatcher — which pawn do you want to send to a teammate?"
                players={everyone}
                tagLabel="Send"
                onPick={moverUserId => { setDispatch(null); onStartDispatchRelocate(moverUserId); }}
                onCancel={() => setDispatch(null)}
            />
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

    // Dispatcher (§11): she can move a teammate's pawn with her hand, and send
    // any pawn to a city another pawn already occupies. The first needs a
    // teammate; the second needs two pawns in different cities to have a shared
    // destination at all.
    const isDispatcher = me.role === 'dispatcher';
    const hasOtherPlayers = Object.values(gs.playerStates).some(p => p.userId !== me.userId);
    const pawnsSpread = new Set(Object.values(gs.playerStates).map(p => p.city)).size >= 2;

    return (
        <div className="ag-actionsheet">
            <div className="ag-build-list">
                {/* ── Movement ─────────────────────────────────────────────── */}
                <MoveTypeRows movesByType={movesByType} onPick={setMoveMode} />

                {/* ── Dispatcher (§11) ──────────────────────────────────────── */}
                {isDispatcher && hasOtherPlayers && (
                    <button type="button" className="ag-build-row" onClick={() => setDispatch({ stage: 'moveWho' })}>
                        <span className="ag-icon-box">🧭</span>
                        <span className="ag-build-main">
                            <span className="ag-build-name">Move a teammate&apos;s pawn</span>
                            <span className="ag-build-cost">Travel their pawn, paid from your hand</span>
                        </span>
                        <span className="ag-build-tag">Dispatch</span>
                    </button>
                )}
                {isDispatcher && (
                    <button
                        type="button"
                        className={`ag-build-row${pawnsSpread ? '' : ' ag-build-row--disabled'}`}
                        disabled={!pawnsSpread}
                        onClick={() => setDispatch({ stage: 'relocateWho' })}
                    >
                        <span className="ag-icon-box">🧭</span>
                        <span className="ag-build-main">
                            <span className="ag-build-name">Send a pawn to a teammate</span>
                            <span className="ag-build-cost">Move any pawn onto another pawn&apos;s city</span>
                        </span>
                        {pawnsSpread
                            ? <span className="ag-build-tag">Dispatch</span>
                            : <span className="ag-build-tag ag-build-tag--muted">No target</span>}
                    </button>
                )}

                {/* ── Operations Expert flight (§11) ──────────────────────── */}
                {me.role === 'opsExpert' && cityState.station && !me.opsExpertFlightUsed && (() => {
                    const hasAnyCityCard = me.hand.some(isCityCardId);
                    return (
                        <button
                            type="button"
                            className={`ag-build-row${hasAnyCityCard ? '' : ' ag-build-row--disabled'}`}
                            disabled={!hasAnyCityCard}
                            onClick={() => setPickingOpsFlight(true)}
                        >
                            <span className="ag-icon-box">🛩</span>
                            <span className="ag-build-main">
                                <span className="ag-build-name">Operations Expert flight</span>
                                <span className="ag-build-cost">Discard any city card to fly anywhere · once per turn</span>
                            </span>
                            {hasAnyCityCard
                                ? <span className="ag-build-tag">Fly</span>
                                : <span className="ag-build-tag ag-build-tag--muted">No card</span>}
                        </button>
                    );
                })()}

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
                {/* The base action moves the shared city's own card (§8.2); the
                    Researcher (§11) instead moves any city card leaving *her*
                    hand — either direction — so those rows open the card picker
                    above rather than submitting outright. Only one Researcher is
                    ever dealt, so a mate is never a Researcher on both sides. */}
                {citymates.flatMap(mate => {
                    const rows: React.ReactNode[] = [];

                    // Give: a card leaves my hand → mate.
                    if (me.role === 'researcher') {
                        if (me.hand.some(isCityCardId)) {
                            rows.push(
                                <button
                                    key={`share:give:${mate.userId}`}
                                    type="button"
                                    className="ag-build-row"
                                    onClick={() => setShareChoice({ userId: mate.userId, username: mate.username, direction: 'give' })}
                                >
                                    <span className="ag-icon-box">🤝</span>
                                    <span className="ag-build-main">
                                        <span className="ag-build-name">Give a card to {mate.username}</span>
                                        <span className="ag-build-cost">Any city card (Researcher)</span>
                                    </span>
                                    <span className="ag-build-tag">Give</span>
                                </button>,
                            );
                        }
                    } else if (hasCityCard) {
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

                    // Take: a card leaves mate's hand → me.
                    if (mate.role === 'researcher') {
                        if (mate.hand.some(isCityCardId)) {
                            rows.push(
                                <button
                                    key={`share:take:${mate.userId}`}
                                    type="button"
                                    className="ag-build-row"
                                    onClick={() => setShareChoice({ userId: mate.userId, username: mate.username, direction: 'take' })}
                                >
                                    <span className="ag-icon-box">🤝</span>
                                    <span className="ag-build-main">
                                        <span className="ag-build-name">Take a card from {mate.username}</span>
                                        <span className="ag-build-cost">Any city card (Researcher)</span>
                                    </span>
                                    <span className="ag-build-tag">Take</span>
                                </button>,
                            );
                        }
                    } else if (mate.hand.includes(me.city)) {
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
