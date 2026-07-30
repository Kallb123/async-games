'use client'
import React, { useState } from 'react';
import type { IWorldDominationSpecificGameStateResponse } from '@/games/WorldDomination/apiModels';
import type { WorldDominationCardType } from '@/games/WorldDomination/board';
import { TERRITORIES, isValidCardSet } from '@/games/WorldDomination/board';
import Dice from '@/components/ui/Dice';
import ActionButton from '@/components/ui/ActionButton';
import type { SubmitCommand } from '@/utils/hooks/useSubmitCommand';
import { useResettingState } from '@/utils/hooks/useResettingState';
import {
    WorldDominationDeployArmies,
    WorldDominationCashInCards,
    WorldDominationAttack,
    WorldDominationOccupyTerritory,
    WorldDominationEndAttackPhase,
    WorldDominationFortify,
    WorldDominationSkipFortify,
} from '@/utils/apiModels/GameLogic';

const CARD_EMOJI: Record<WorldDominationCardType, string> = {
    infantry: '🪖', cavalry: '🐎', artillery: '💣', wild: '🃏',
};
const CARD_NAME: Record<WorldDominationCardType, string> = {
    infantry: 'Infantry', cavalry: 'Cavalry', artillery: 'Artillery', wild: 'Wild',
};

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
            <button type="button" className="ag-btn ag-btn--light" style={{ width: 40, padding: '8px 0' }}
                disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
            <span style={{ font: '800 18px var(--ag-font)', minWidth: 32, textAlign: 'center' }}>{value}</span>
            <button type="button" className="ag-btn ag-btn--light" style={{ width: 40, padding: '8px 0' }}
                disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
        </div>
    );
}

interface WorldDominationActionsProps {
    gs: IWorldDominationSpecificGameStateResponse;
    myUsername: string;
    selFrom: number | null;
    selTo: number | null;
    setSelFrom: (id: number | null) => void;
    setSelTo: (id: number | null) => void;
    submitCommand: SubmitCommand;
    /** The `target` of the in-flight command, so the tapped button alone shows as
     *  processing. Null when nothing is in flight. */
    pendingTarget: string | null;
}

export default function WorldDominationActions({
    gs, myUsername, selFrom, selTo, setSelFrom, setSelTo, submitCommand, pendingTarget,
}: WorldDominationActionsProps) {
    const me = gs.playerStates[myUsername];
    const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

    // Every stepper starts over when the thing it counts against changes: a new
    // territory selection, a fresh pool of reinforcements, a new occupation to
    // garrison.
    const selectionKey = `${selFrom}:${selTo}`;
    const occupation = gs.pendingOccupation;
    const [deployCount, setDeployCount] = useResettingState(1, `${selFrom}:${gs.reinforcementsRemaining}`);
    const [diceCount, setDiceCount] = useResettingState(1, selectionKey);
    const [fortifyCount, setFortifyCount] = useResettingState(1, selectionKey);
    const [occupyCount, setOccupyCount] = useResettingState(
        occupation?.minArmies ?? 1,
        `${occupation?.toTerritoryId}:${occupation?.minArmies}`,
    );

    const fromTerritory = selFrom !== null ? gs.territories[selFrom] : null;
    const toTerritory = selTo !== null ? gs.territories[selTo] : null;

    if (!me) return null;

    function clearSelection() {
        setSelFrom(null);
        setSelTo(null);
    }

    // ── Cash in a Risk card set (mandatory once you hold 5+) ───────────────────
    function toggleCard(id: string) {
        setSelectedCardIds(prev => {
            if (prev.includes(id)) return prev.filter(c => c !== id);
            if (prev.length >= 3) return prev;
            return [...prev, id];
        });
    }
    const selectedCards = me.cards.filter(c => selectedCardIds.includes(c.id));
    const canCashIn = selectedCards.length === 3 && isValidCardSet(selectedCards);
    function cashIn() {
        const cmd = new WorldDominationCashInCards();
        cmd.cardIds = selectedCardIds;
        submitCommand(cmd, () => setSelectedCardIds([]), 'cashIn');
    }
    const mustCashIn = me.cards.length >= 5;

    const cardHand = me.cards.length > 0 ? (
        <div className="ag-actionsheet" style={{ paddingTop: mustCashIn ? 10 : 0 }}>
            {mustCashIn && (
                <div className="ag-callout" style={{ marginBottom: 10 }}>
                    <b>🃏 5+ cards</b> · you must cash in a set before doing anything else.
                </div>
            )}
            <div className="ag-chips">
                {me.cards.map(c => (
                    <button
                        key={c.id}
                        type="button"
                        className={`ag-chip${selectedCardIds.includes(c.id) ? ' ag-chip--active' : ''}`}
                        onClick={() => toggleCard(c.id)}
                    >
                        {CARD_EMOJI[c.type]} {CARD_NAME[c.type]}
                        {c.territoryId !== null ? ` · ${TERRITORIES[c.territoryId].name}` : ''}
                    </button>
                ))}
            </div>
            {selectedCardIds.length > 0 && (
                <ActionButton
                    className={`ag-btn ${canCashIn ? 'ag-btn--primary' : 'ag-btn--light'} ag-btn--block`}
                    style={{ marginTop: 10 }}
                    disabled={!canCashIn}
                    pending={pendingTarget === 'cashIn'}
                    pendingLabel="Cashing in…"
                    onClick={cashIn}
                >
                    {canCashIn ? 'Cash in for armies' : 'Select a valid 3-card set'}
                </ActionButton>
            )}
        </div>
    ) : null;

    // ── Setup / Reinforce: place armies on the board ────────────────────────────
    if (gs.phase === 'setup' || gs.phase === 'reinforce' || (gs.phase === 'attack' && gs.reinforcementsRemaining > 0)) {
        if (gs.phase === 'reinforce' && mustCashIn) {
            return cardHand;
        }

        function deploy() {
            if (selFrom === null) return;
            const cmd = new WorldDominationDeployArmies();
            cmd.territoryId = selFrom;
            cmd.count = deployCount;
            submitCommand(cmd, () => setSelFrom(null), 'deploy');
        }

        return (
            <div className="ag-actionsheet">
                <div className="ag-callout" style={{ marginBottom: 10 }}>
                    <b>{gs.reinforcementsRemaining}</b> arm{gs.reinforcementsRemaining === 1 ? 'y' : 'ies'} left to place
                    {gs.phase === 'setup' ? ' (setup)' : ''}.
                </div>
                {selFrom === null ? (
                    <p className="ag-action-hint">Tap one of your territories on the map to deploy there.</p>
                ) : (
                    <>
                        <p className="ag-action-hint" style={{ marginTop: 0 }}>
                            Deploying to <b>{TERRITORIES[selFrom].name}</b> ({fromTerritory?.armies ?? 0} there now)
                        </p>
                        <Stepper value={deployCount} min={1} max={gs.reinforcementsRemaining} onChange={setDeployCount} />
                        <div className="ag-action-grid" style={{ marginTop: 10 }}>
                            <button type="button" className="ag-btn ag-btn--light" onClick={() => setSelFrom(null)}>Change spot</button>
                            <ActionButton
                                className="ag-btn ag-btn--primary"
                                pending={pendingTarget === 'deploy'}
                                pendingLabel="Placing…"
                                onClick={deploy}
                            >
                                Place {deployCount}
                            </ActionButton>
                        </div>
                    </>
                )}
                {gs.phase === 'reinforce' && cardHand}
            </div>
        );
    }

    // ── Attack ───────────────────────────────────────────────────────────────
    if (gs.phase === 'attack') {
        if (gs.pendingOccupation) {
            const p = gs.pendingOccupation;
            return (
                <div className="ag-actionsheet">
                    <div className="ag-callout" style={{ marginBottom: 10 }}>
                        <b>Conquered {TERRITORIES[p.toTerritoryId].name}!</b> Move armies in.
                    </div>
                    <Stepper value={occupyCount} min={p.minArmies} max={Math.max(p.minArmies, p.maxArmies)} onChange={setOccupyCount} />
                    <ActionButton
                        className="ag-btn ag-btn--primary ag-btn--block"
                        style={{ marginTop: 10 }}
                        pending={pendingTarget === 'occupy'}
                        pendingLabel="Moving in…"
                        onClick={() => {
                            const cmd = new WorldDominationOccupyTerritory();
                            cmd.armies = occupyCount;
                            submitCommand(cmd, clearSelection, 'occupy');
                        }}
                    >
                        Move {occupyCount} in
                    </ActionButton>
                </div>
            );
        }

        if (mustCashIn) return cardHand;

        function endAttackPhase() {
            submitCommand(new WorldDominationEndAttackPhase(), clearSelection, 'endAttack');
        }

        if (selFrom === null) {
            return (
                <div className="ag-actionsheet">
                    <p className="ag-action-hint" style={{ marginTop: 0 }}>Tap one of your territories (2+ armies) to attack from, or move on.</p>
                    {cardHand}
                    <ActionButton
                        className="ag-btn ag-btn--success ag-btn--block"
                        style={{ marginTop: 10 }}
                        pending={pendingTarget === 'endAttack'}
                        pendingLabel="Moving to Fortify…"
                        onClick={endAttackPhase}
                    >
                        ✓ Done attacking → Fortify
                    </ActionButton>
                </div>
            );
        }
        if (selTo === null) {
            return (
                <div className="ag-actionsheet">
                    <p className="ag-action-hint" style={{ marginTop: 0 }}>
                        Attacking from <b>{TERRITORIES[selFrom].name}</b> ({fromTerritory?.armies ?? 0} armies) — tap an adjacent enemy territory.
                    </p>
                    <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={() => setSelFrom(null)}>↩ Cancel</button>
                </div>
            );
        }

        const fromArmies = fromTerritory?.armies ?? 0;
        const maxDice = Math.min(3, fromArmies - 1);
        const lastBattle = gs.lastBattle;
        const isThisBattle = lastBattle
            && lastBattle.fromTerritoryId === selFrom
            && lastBattle.toTerritoryId === selTo;

        function roll() {
            const cmd = new WorldDominationAttack();
            cmd.fromTerritoryId = selFrom!;
            cmd.toTerritoryId = selTo!;
            cmd.attackerDiceCount = diceCount;
            submitCommand(cmd, undefined, 'attack');
        }

        return (
            <div className="ag-actionsheet">
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ font: '800 14px var(--ag-font)' }}>{TERRITORIES[selFrom].name} → {TERRITORIES[selTo].name}</span>
                    <button type="button" className="ag-link-muted" onClick={clearSelection}>choose another</button>
                </div>

                {isThisBattle && lastBattle && (
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 8 }}>
                            <div style={{ textAlign: 'center' }}>
                                <div className="ag-action-hint" style={{ marginTop: 0, marginBottom: 4 }}>YOUR ROLL</div>
                                <Dice values={lastBattle.attackerDice} size={30} />
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div className="ag-action-hint" style={{ marginTop: 0, marginBottom: 4 }}>DEFENDER&apos;S ROLL</div>
                                <Dice values={lastBattle.defenderDice} size={30} />
                            </div>
                        </div>
                        <div className="ag-callout" style={{ textAlign: 'center' }}>
                            You lost <b>{lastBattle.attackerLosses}</b> · defender lost <b>{lastBattle.defenderLosses}</b>
                            {lastBattle.conquered && ' — conquered! 🎉'}
                            {lastBattle.defenderEliminated && ` — an opponent was eliminated!`}
                        </div>
                    </div>
                )}

                {fromArmies >= 2 ? (
                    <>
                        <p className="ag-action-hint" style={{ marginTop: 0 }}>
                            {fromArmies} armies at {TERRITORIES[selFrom].name} · roll up to {maxDice} {maxDice === 1 ? 'die' : 'dice'}
                        </p>
                        <Stepper value={diceCount} min={1} max={Math.max(1, maxDice)} onChange={setDiceCount} />
                        <div className="ag-action-grid" style={{ marginTop: 10 }}>
                            <button type="button" className="ag-btn ag-btn--light" onClick={clearSelection}>Stop attack</button>
                            <ActionButton
                                className="ag-btn ag-btn--primary ag-btn--roll"
                                pending={pendingTarget === 'attack'}
                                pendingLabel="Rolling…"
                                onClick={roll}
                            >
                                🎲 Roll
                            </ActionButton>
                        </div>
                    </>
                ) : (
                    <p className="ag-action-hint">Not enough armies left here to keep attacking.</p>
                )}
            </div>
        );
    }

    // ── Fortify ──────────────────────────────────────────────────────────────
    if (gs.phase === 'fortify') {
        function skip() {
            submitCommand(new WorldDominationSkipFortify(), clearSelection, 'skipFortify');
        }
        if (selFrom === null) {
            return (
                <div className="ag-actionsheet">
                    <p className="ag-action-hint" style={{ marginTop: 0 }}>Tap a territory to move armies from, or skip.</p>
                    <ActionButton
                        className="ag-btn ag-btn--success ag-btn--block"
                        pending={pendingTarget === 'skipFortify'}
                        pendingLabel="Ending your turn…"
                        onClick={skip}
                    >
                        Skip fortifying
                    </ActionButton>
                </div>
            );
        }
        if (selTo === null) {
            return (
                <div className="ag-actionsheet">
                    <p className="ag-action-hint" style={{ marginTop: 0 }}>
                        Moving from <b>{TERRITORIES[selFrom].name}</b> — tap a connected territory of yours.
                    </p>
                    <button type="button" className="ag-btn ag-btn--light ag-btn--block" onClick={() => setSelFrom(null)}>↩ Cancel</button>
                </div>
            );
        }
        const fromArmies = fromTerritory?.armies ?? 0;
        function fortify() {
            const cmd = new WorldDominationFortify();
            cmd.fromTerritoryId = selFrom!;
            cmd.toTerritoryId = selTo!;
            cmd.armies = fortifyCount;
            submitCommand(cmd, clearSelection, 'fortify');
        }
        return (
            <div className="ag-actionsheet">
                <p className="ag-action-hint" style={{ marginTop: 0 }}>
                    {TERRITORIES[selFrom].name} → {TERRITORIES[selTo!].name}
                </p>
                <Stepper value={fortifyCount} min={1} max={Math.max(1, fromArmies - 1)} onChange={setFortifyCount} />
                <div className="ag-action-grid" style={{ marginTop: 10 }}>
                    <button type="button" className="ag-btn ag-btn--light" onClick={clearSelection}>Cancel</button>
                    <ActionButton
                        className="ag-btn ag-btn--primary"
                        pending={pendingTarget === 'fortify'}
                        pendingLabel="Moving…"
                        onClick={fortify}
                    >
                        Move {fortifyCount}
                    </ActionButton>
                </div>
            </div>
        );
    }

    return null;
}
