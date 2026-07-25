'use client'
import React, { useEffect, useState } from 'react';
import type { IWorldDominationSpecificGameStateResponse } from '@/games/WorldDomination/apiModels';
import type { WorldDominationCardType } from '@/games/WorldDomination/board';
import { TERRITORIES, isValidCardSet } from '@/games/WorldDomination/board';
import DieFace from '@/components/ui/DieFace';
import { IGameCommand } from '@/utils/apiModels/GameLogic';
import type { ICommandResponse } from '@/app/api/game/command/route';
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
    submitCommand: (cmd: IGameCommand, cb: (r: ICommandResponse) => void) => void;
}

export default function WorldDominationActions({
    gs, myUsername, selFrom, selTo, setSelFrom, setSelTo, submitCommand,
}: WorldDominationActionsProps) {
    const me = gs.playerStates[myUsername];
    const [deployCount, setDeployCount] = useState(1);
    const [diceCount, setDiceCount] = useState(1);
    const [occupyCount, setOccupyCount] = useState(1);
    const [fortifyCount, setFortifyCount] = useState(1);
    const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

    const fromTerritory = selFrom !== null ? gs.territories[selFrom] : null;
    const toTerritory = selTo !== null ? gs.territories[selTo] : null;

    useEffect(() => {
        setDeployCount(1);
    }, [selFrom, gs.reinforcementsRemaining]);

    useEffect(() => {
        setDiceCount(1);
    }, [selFrom, selTo]);

    useEffect(() => {
        if (gs.pendingOccupation) setOccupyCount(gs.pendingOccupation.minArmies);
    }, [gs.pendingOccupation?.toTerritoryId, gs.pendingOccupation?.minArmies]);

    useEffect(() => {
        setFortifyCount(1);
    }, [selFrom, selTo]);

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
        submitCommand(cmd, () => setSelectedCardIds([]));
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
                <button
                    type="button"
                    className={`ag-btn ${canCashIn ? 'ag-btn--primary' : 'ag-btn--light'} ag-btn--block`}
                    style={{ marginTop: 10 }}
                    disabled={!canCashIn}
                    onClick={cashIn}
                >
                    {canCashIn ? 'Cash in for armies' : 'Select a valid 3-card set'}
                </button>
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
            submitCommand(cmd, () => setSelFrom(null));
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
                            <button type="button" className="ag-btn ag-btn--primary" onClick={deploy}>Place {deployCount}</button>
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
                    <button
                        type="button"
                        className="ag-btn ag-btn--primary ag-btn--block"
                        style={{ marginTop: 10 }}
                        onClick={() => {
                            const cmd = new WorldDominationOccupyTerritory();
                            cmd.armies = occupyCount;
                            submitCommand(cmd, clearSelection);
                        }}
                    >
                        Move {occupyCount} in
                    </button>
                </div>
            );
        }

        if (mustCashIn) return cardHand;

        function endAttackPhase() {
            submitCommand(new WorldDominationEndAttackPhase(), clearSelection);
        }

        if (selFrom === null) {
            return (
                <div className="ag-actionsheet">
                    <p className="ag-action-hint" style={{ marginTop: 0 }}>Tap one of your territories (2+ armies) to attack from, or move on.</p>
                    {cardHand}
                    <button type="button" className="ag-btn ag-btn--success ag-btn--block" style={{ marginTop: 10 }} onClick={endAttackPhase}>
                        ✓ Done attacking → Fortify
                    </button>
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
            submitCommand(cmd, () => { });
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
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {lastBattle.attackerDice.map((d, i) => <DieFace key={i} value={d} size={30} />)}
                                </div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div className="ag-action-hint" style={{ marginTop: 0, marginBottom: 4 }}>DEFENDER&apos;S ROLL</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {lastBattle.defenderDice.map((d, i) => <DieFace key={i} value={d} size={30} />)}
                                </div>
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
                            <button type="button" className="ag-btn ag-btn--primary ag-btn--roll" onClick={roll}>🎲 Roll</button>
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
            submitCommand(new WorldDominationSkipFortify(), clearSelection);
        }
        if (selFrom === null) {
            return (
                <div className="ag-actionsheet">
                    <p className="ag-action-hint" style={{ marginTop: 0 }}>Tap a territory to move armies from, or skip.</p>
                    <button type="button" className="ag-btn ag-btn--success ag-btn--block" onClick={skip}>Skip fortifying</button>
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
            submitCommand(cmd, clearSelection);
        }
        return (
            <div className="ag-actionsheet">
                <p className="ag-action-hint" style={{ marginTop: 0 }}>
                    {TERRITORIES[selFrom].name} → {TERRITORIES[selTo!].name}
                </p>
                <Stepper value={fortifyCount} min={1} max={Math.max(1, fromArmies - 1)} onChange={setFortifyCount} />
                <div className="ag-action-grid" style={{ marginTop: 10 }}>
                    <button type="button" className="ag-btn ag-btn--light" onClick={clearSelection}>Cancel</button>
                    <button type="button" className="ag-btn ag-btn--primary" onClick={fortify}>Move {fortifyCount}</button>
                </div>
            </div>
        );
    }

    return null;
}
