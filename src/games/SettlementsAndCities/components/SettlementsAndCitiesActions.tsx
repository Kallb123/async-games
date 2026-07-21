'use client'
import React, { useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import type { ISACSpecificGameStateResponse } from '@/games/SettlementsAndCities/apiModels';
import type { SAC_Resource, SAC_DevCard } from '@/games/SettlementsAndCities/board';
import { SAC_DEV_CARD_META, SAC_DEV_CARD_ORDER } from '@/games/SettlementsAndCities/ui';
import { IGameCommand } from '@/utils/apiModels/GameLogic';
import type { ICommandResponse } from '@/app/api/game/command/route';
import {
    SACRollDice,
    SACEndTurn,
    SACPlayKnight,
    SACBuyDevCard,
    SACPlayRoadBuilding,
    SACPlayYearOfPlenty,
    SACPlayMonopoly,
    SACMaritimeTrade,
} from '@/utils/apiModels/GameLogic';

export type SACBoardMode =
    | 'idle'
    | 'placeSettlementSetup'
    | 'placeRoadSetup'
    | 'placeSettlement'
    | 'placeRoad'
    | 'placeCity'
    | 'moveRobber';

const RESOURCES: SAC_Resource[] = ['lumber', 'wool', 'grain', 'brick', 'ore'];
const RESOURCE_EMOJI: Record<SAC_Resource, string> = {
    lumber: '🪵', wool: '🐑', grain: '🌾', brick: '🧱', ore: '⛏️',
};

type Cost = Partial<Record<SAC_Resource, number>>;

function costText(cost: Cost): string {
    return (Object.keys(cost) as SAC_Resource[])
        .map(r => `${RESOURCE_EMOJI[r]}${cost[r]}`)
        .join(' ');
}

/** Short "need N more 🧱" hint for the first resource the player is short on. */
function shortfall(cost: Cost, res: Record<SAC_Resource, number>): string | null {
    const parts = (Object.keys(cost) as SAC_Resource[])
        .filter(r => (res[r] ?? 0) < (cost[r] ?? 0))
        .map(r => `${(cost[r] ?? 0) - (res[r] ?? 0)} more ${RESOURCE_EMOJI[r]}`);
    return parts.length ? `need ${parts.join(', ')}` : null;
}

interface SettlementsAndCitiesActionsProps {
    gs: ISACSpecificGameStateResponse;
    myUsername: string;
    myUserId: string;
    boardMode: SACBoardMode;
    setBoardMode: (mode: SACBoardMode) => void;
    submitCommand: (cmd: IGameCommand, cb: (r: ICommandResponse) => void) => void;
}

export default function SettlementsAndCitiesActions({
    gs,
    myUsername,
    boardMode,
    setBoardMode,
    submitCommand,
}: SettlementsAndCitiesActionsProps) {
    const [showYopModal, setShowYopModal] = useState(false);
    const [yopR1, setYopR1] = useState<SAC_Resource>('lumber');
    const [yopR2, setYopR2] = useState<SAC_Resource>('lumber');

    const [showMonopolyModal, setShowMonopolyModal] = useState(false);
    const [monopolyR, setMonopolyR] = useState<SAC_Resource>('lumber');

    const [showTradeModal, setShowTradeModal] = useState(false);
    const [tradeOffer, setTradeOffer] = useState<SAC_Resource>('lumber');
    const [tradeWant, setTradeWant] = useState<SAC_Resource>('wool');

    const myState = gs.playerStates[myUsername];
    const myDevCards = gs.playerDevCards?.[myUsername];
    if (!myState) return null;

    const phase = gs.phase;
    const isSetup = phase === 'setup';
    const hasRolled = gs.hasRolled;
    const pendingRobber = gs.pendingRobber;
    const pendingRoadBuilding = gs.pendingRoadBuilding;
    const playedDevCard = gs.playedDevCard;
    const specialBuild = gs.specialBuildActive;

    function submit<T extends IGameCommand>(cmd: T) {
        submitCommand(cmd, () => { setBoardMode('idle'); });
    }
    function toggleMode(mode: SACBoardMode) {
        setBoardMode(boardMode === mode ? 'idle' : mode);
    }

    // ── Shared build list (settlement / road / city + dev card + bank trade) ────
    // Reused by the post-roll main turn and the 5–6 Special Build Phase, which
    // both let a player spend resources on the board and trade with the bank.
    const res = myState.resources;
    const ROAD_COST: Cost = { brick: 1, lumber: 1 };
    const SETTLEMENT_COST: Cost = { brick: 1, lumber: 1, wool: 1, grain: 1 };
    const CITY_COST: Cost = { grain: 2, ore: 3 };

    interface BuildDef {
        mode: SACBoardMode;
        icon: string;
        name: string;
        cost: Cost;
        suffix: string;
        piecesLeft: number;
    }
    const builds: BuildDef[] = [
        { mode: 'placeSettlement', icon: '🛖', name: 'Settlement', cost: SETTLEMENT_COST, suffix: '+1 VP', piecesLeft: myState.remainingSettlements },
        { mode: 'placeRoad', icon: '🛤️', name: 'Road', cost: ROAD_COST, suffix: 'reach new spots', piecesLeft: myState.remainingRoads },
        { mode: 'placeCity', icon: '🏰', name: 'City', cost: CITY_COST, suffix: '+2 VP', piecesLeft: myState.remainingCities },
    ];
    const DEV_CARD_COST: Cost = { wool: 1, grain: 1, ore: 1 };
    const devShort = shortfall(DEV_CARD_COST, res);
    const devDeckEmpty = gs.devCardDeckSize <= 0;
    const canBuyDevCard = !devShort && !devDeckEmpty;

    const buildList = (
        <div className="ag-build-list">
            {builds.map(b => {
                const short = shortfall(b.cost, res);
                const noPieces = b.piecesLeft <= 0;
                const affordable = !short && !noPieces;
                const active = boardMode === b.mode;
                const disabled = !affordable && !active;
                const reason = noPieces ? 'No pieces left' : short;
                return (
                    <button
                        key={b.mode}
                        className={`ag-build-row${active ? ' ag-build-row--active' : ''}${disabled ? ' ag-build-row--disabled' : ''}`}
                        disabled={disabled}
                        onClick={() => !disabled && toggleMode(b.mode)}
                    >
                        <span className="ag-build-icon">{b.icon}</span>
                        <span className="ag-build-main">
                            <span className="ag-build-name">{b.name}</span>
                            <span className="ag-build-cost">{costText(b.cost)} · {b.suffix}</span>
                        </span>
                        {affordable
                            ? <span className="ag-build-tag">{active ? 'Cancel' : 'Build'}</span>
                            : <span className="ag-build-tag ag-build-tag--muted">{reason}</span>}
                    </button>
                );
            })}

            <button
                className={`ag-build-row${!canBuyDevCard ? ' ag-build-row--disabled' : ''}`}
                disabled={!canBuyDevCard}
                onClick={() => canBuyDevCard && submit(new SACBuyDevCard())}
            >
                <span className="ag-build-icon">🃏</span>
                <span className="ag-build-main">
                    <span className="ag-build-name">Dev card</span>
                    <span className="ag-build-cost">{costText(DEV_CARD_COST)} · draw a development card</span>
                </span>
                {canBuyDevCard
                    ? <span className="ag-build-tag">Buy</span>
                    : <span className="ag-build-tag ag-build-tag--muted">{devDeckEmpty ? 'Deck empty' : devShort}</span>}
            </button>

            <div className="ag-action-grid">
                <button className="ag-btn ag-btn--light" onClick={() => setShowTradeModal(true)}>
                    ⚖️ Trade with the bank
                </button>
            </div>
        </div>
    );

    // ── Maritime trade modal (needed by both the main turn and Special Build) ───
    const tradeModal = (
        <Modal show={showTradeModal} onHide={() => setShowTradeModal(false)}>
            <Modal.Header closeButton><Modal.Title>Maritime Trade</Modal.Title></Modal.Header>
            <Modal.Body>
                <Form.Group className="mb-2">
                    <Form.Label>Offer (give)</Form.Label>
                    <Form.Select value={tradeOffer} onChange={e => setTradeOffer(e.target.value as SAC_Resource)}>
                        {RESOURCES.map(r => <option key={r} value={r}>{RESOURCE_EMOJI[r]} {r} (have: {res[r]})</option>)}
                    </Form.Select>
                </Form.Group>
                <Form.Group>
                    <Form.Label>Want (receive)</Form.Label>
                    <Form.Select value={tradeWant} onChange={e => setTradeWant(e.target.value as SAC_Resource)}>
                        {RESOURCES.map(r => <option key={r} value={r}>{RESOURCE_EMOJI[r]} {r}</option>)}
                    </Form.Select>
                </Form.Group>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowTradeModal(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => {
                    const cmd = new SACMaritimeTrade();
                    cmd.offerResource = tradeOffer;
                    cmd.wantResource = tradeWant;
                    submit(cmd);
                    setShowTradeModal(false);
                }}>Trade</Button>
            </Modal.Footer>
        </Modal>
    );

    // ── Development cards ───────────────────────────────────────────────────────
    // One shared panel, rendered both before and after the roll: a dev card may
    // be played at any point on your own main turn (one per turn). Playable cards
    // (Knight / Road Building / Year of Plenty / Monopoly) get a Play button;
    // hidden Victory Points and cards bought this turn are shown as passive notes.
    const myNewDevCards = gs.playerNewDevCards?.[myUsername];
    const canPlayDevCards = !isSetup && !specialBuild && !pendingRobber && pendingRoadBuilding === 0 && !playedDevCard;
    const heldPlayable = SAC_DEV_CARD_ORDER.filter(
        c => SAC_DEV_CARD_META[c].playable && (myDevCards?.[c] ?? 0) > 0,
    );
    const vpCount = myDevCards?.victoryPoint ?? 0;
    const newDevTotal = myNewDevCards
        ? Object.values(myNewDevCards).reduce((s, n) => s + n, 0)
        : 0;

    function playDevCard(card: SAC_DevCard) {
        if (card === 'knight') submit(new SACPlayKnight());
        else if (card === 'roadBuilding') submit(new SACPlayRoadBuilding());
        else if (card === 'yearOfPlenty') setShowYopModal(true);
        else if (card === 'monopoly') setShowMonopolyModal(true);
    }

    const devCardSection = (heldPlayable.length > 0 || vpCount > 0 || newDevTotal > 0) ? (
        <div className="ag-devcards">
            <div className="ag-devcards-head">🃏 Development cards</div>
            {heldPlayable.map(card => {
                const meta = SAC_DEV_CARD_META[card];
                const count = myDevCards?.[card] ?? 0;
                const disabled = !canPlayDevCards;
                return (
                    <button
                        key={card}
                        className={`ag-build-row${disabled ? ' ag-build-row--disabled' : ''}`}
                        disabled={disabled}
                        onClick={() => !disabled && playDevCard(card)}
                    >
                        <span className="ag-build-icon">{meta.emoji}</span>
                        <span className="ag-build-main">
                            <span className="ag-build-name">{meta.name}{count > 1 ? ` ×${count}` : ''}</span>
                            <span className="ag-build-cost">{meta.blurb}</span>
                        </span>
                        <span className={`ag-build-tag${disabled ? ' ag-build-tag--muted' : ''}`}>
                            {playedDevCard ? 'Played' : 'Play'}
                        </span>
                    </button>
                );
            })}
            {vpCount > 0 && (
                <div className="ag-devcard-note ag-devcard-note--vp">
                    🏆 {vpCount} Victory Point card{vpCount > 1 ? 's' : ''} · worth +{vpCount} VP, revealed automatically when you can win.
                </div>
            )}
            {newDevTotal > 0 && (
                <div className="ag-devcard-note">
                    🃏 {newDevTotal} card{newDevTotal > 1 ? 's' : ''} bought this turn — playable next turn.
                </div>
            )}
            {playedDevCard && heldPlayable.length > 0 && (
                <div className="ag-devcard-note">One development card per turn — you&apos;ve played yours.</div>
            )}
        </div>
    ) : null;

    // ── Year of Plenty modal (shared by pre- and post-roll) ─────────────────────
    const yopModal = (
        <Modal show={showYopModal} onHide={() => setShowYopModal(false)}>
            <Modal.Header closeButton><Modal.Title>Year of Plenty</Modal.Title></Modal.Header>
            <Modal.Body>
                <Form.Group className="mb-2">
                    <Form.Label>First resource</Form.Label>
                    <Form.Select value={yopR1} onChange={e => setYopR1(e.target.value as SAC_Resource)}>
                        {RESOURCES.map(r => <option key={r} value={r}>{RESOURCE_EMOJI[r]} {r}</option>)}
                    </Form.Select>
                </Form.Group>
                <Form.Group>
                    <Form.Label>Second resource</Form.Label>
                    <Form.Select value={yopR2} onChange={e => setYopR2(e.target.value as SAC_Resource)}>
                        {RESOURCES.map(r => <option key={r} value={r}>{RESOURCE_EMOJI[r]} {r}</option>)}
                    </Form.Select>
                </Form.Group>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowYopModal(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => {
                    const cmd = new SACPlayYearOfPlenty();
                    cmd.resource1 = yopR1;
                    cmd.resource2 = yopR2;
                    submit(cmd);
                    setShowYopModal(false);
                }}>Confirm</Button>
            </Modal.Footer>
        </Modal>
    );

    // ── Monopoly modal (shared by pre- and post-roll) ───────────────────────────
    const monopolyModal = (
        <Modal show={showMonopolyModal} onHide={() => setShowMonopolyModal(false)}>
            <Modal.Header closeButton><Modal.Title>Monopoly</Modal.Title></Modal.Header>
            <Modal.Body>
                <Form.Group>
                    <Form.Label>Choose a resource to monopolise</Form.Label>
                    <Form.Select value={monopolyR} onChange={e => setMonopolyR(e.target.value as SAC_Resource)}>
                        {RESOURCES.map(r => <option key={r} value={r}>{RESOURCE_EMOJI[r]} {r}</option>)}
                    </Form.Select>
                </Form.Group>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowMonopolyModal(false)}>Cancel</Button>
                <Button variant="primary" onClick={() => {
                    const cmd = new SACPlayMonopoly();
                    cmd.resource = monopolyR;
                    submit(cmd);
                    setShowMonopolyModal(false);
                }}>Confirm</Button>
            </Modal.Footer>
        </Modal>
    );

    // ── Setup mode ────────────────────────────────────────────────────────────
    if (isSetup) {
        const placing = !gs.pendingRoadSetup;
        const mode: SACBoardMode = placing ? 'placeSettlementSetup' : 'placeRoadSetup';
        const active = boardMode === mode;
        return (
            <div className="ag-actionsheet">
                <button
                    className={`ag-btn ${active ? 'ag-btn--dark' : 'ag-btn--primary'} ag-btn--block`}
                    onClick={() => toggleMode(mode)}
                >
                    {active
                        ? '↩ Cancel'
                        : placing ? '🛖 Place your settlement' : '🛤️ Place a road next to it'}
                </button>
                <p className="ag-action-hint">
                    {active
                        ? 'Tap a highlighted spot on the board.'
                        : placing
                            ? 'Setup — choose where your settlement goes.'
                            : 'Setup — connect a road to your new settlement.'}
                </p>
            </div>
        );
    }

    // ── Special Build Phase (5–6 Player Extension, §8.5) ────────────────────────
    // Between the active player's turns, every other player may build and trade
    // with the bank once — no rolling, robber or dev-card plays.
    if (specialBuild) {
        return (
            <div className="ag-actionsheet">
                <div className="ag-callout" style={{ marginBottom: 10 }}>
                    <b>⚡ Special Build</b> · spend resources to build or trade with the bank, then pass.
                </div>
                {buildList}
                <button className="ag-btn ag-btn--success ag-btn--block" style={{ marginTop: 12, padding: '14px 0', fontSize: 15 }}
                    onClick={() => submit(new SACEndTurn())}>
                    ✓ Done building
                </button>
                <p className="ag-action-hint">Nothing to build? Just pass — the dice move on once everyone&apos;s had a chance.</p>
                {tradeModal}
            </div>
        );
    }

    // ── Robber ────────────────────────────────────────────────────────────────
    if (pendingRobber) {
        const active = boardMode === 'moveRobber';
        return (
            <div className="ag-actionsheet">
                <button
                    className={`ag-btn ${active ? 'ag-btn--dark' : 'ag-btn--primary'} ag-btn--block`}
                    onClick={() => toggleMode('moveRobber')}
                >
                    {active ? '↩ Cancel' : '🏴‍☠️ Move the robber'}
                </button>
                <p className="ag-action-hint">
                    {active ? 'Tap a hex to move the robber there.' : 'You rolled 7 — move the robber to a new hex.'}
                </p>
            </div>
        );
    }

    // ── Pending road building ─────────────────────────────────────────────────
    if (pendingRoadBuilding > 0) {
        const active = boardMode === 'placeRoad';
        return (
            <div className="ag-actionsheet">
                <button
                    className={`ag-btn ${active ? 'ag-btn--dark' : 'ag-btn--primary'} ag-btn--block`}
                    onClick={() => toggleMode('placeRoad')}
                >
                    {active ? '↩ Cancel' : `🛤️ Place ${pendingRoadBuilding} free road${pendingRoadBuilding > 1 ? 's' : ''}`}
                </button>
                <p className="ag-action-hint">Road Building — free roads from your dev card.</p>
            </div>
        );
    }

    // ── Pre-roll ──────────────────────────────────────────────────────────────
    if (!hasRolled) {
        return (
            <div className="ag-actionsheet">
                <button
                    className="ag-btn ag-btn--primary ag-btn--roll ag-btn--block"
                    style={{ padding: '16px 0', fontSize: 16 }}
                    onClick={() => submit(new SACRollDice())}
                >
                    🎲 Roll the dice
                </button>
                {devCardSection && <div style={{ marginTop: 12 }}>{devCardSection}</div>}
                {yopModal}
                {monopolyModal}
            </div>
        );
    }

    // ── Post-roll ─────────────────────────────────────────────────────────────
    return (
        <div className="ag-actionsheet">
            {buildList}

            {devCardSection && <div style={{ marginTop: 12 }}>{devCardSection}</div>}

            <button className="ag-btn ag-btn--success ag-btn--block" style={{ marginTop: 12, padding: '14px 0', fontSize: 15 }}
                onClick={() => submit(new SACEndTurn())}>
                ✓ End turn
            </button>
            <p className="ag-action-hint">We&apos;ll let the next player know it&apos;s their move.</p>

            {yopModal}
            {monopolyModal}
            {tradeModal}
        </div>
    );
}
