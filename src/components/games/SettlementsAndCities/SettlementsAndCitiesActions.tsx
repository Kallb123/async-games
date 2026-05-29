'use client'
import React, { useState } from 'react';
import { Button, ButtonGroup, Form, Modal, Row, Col } from 'react-bootstrap';
import type { ISACSpecificGameStateResponse } from '@/games/SettlementsAndCities/apiModels';
import type { SAC_Resource } from '@/games/SettlementsAndCities/board';
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
    myUserId,
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

    function submit<T extends IGameCommand>(cmd: T) {
        submitCommand(cmd, () => { setBoardMode('idle'); });
    }

    // ── Setup mode ────────────────────────────────────────────────────────────
    if (isSetup) {
        if (!gs.pendingRoadSetup) {
            return (
                <div>
                    <p>Setup: Place your settlement</p>
                    <Button
                        variant={boardMode === 'placeSettlementSetup' ? 'warning' : 'primary'}
                        onClick={() => setBoardMode(boardMode === 'placeSettlementSetup' ? 'idle' : 'placeSettlementSetup')}
                    >
                        {boardMode === 'placeSettlementSetup' ? '↩ Cancel' : 'Place Settlement'}
                    </Button>
                </div>
            );
        } else {
            return (
                <div>
                    <p>Setup: Place a road next to your settlement</p>
                    <Button
                        variant={boardMode === 'placeRoadSetup' ? 'warning' : 'primary'}
                        onClick={() => setBoardMode(boardMode === 'placeRoadSetup' ? 'idle' : 'placeRoadSetup')}
                    >
                        {boardMode === 'placeRoadSetup' ? '↩ Cancel' : 'Place Road'}
                    </Button>
                </div>
            );
        }
    }

    // ── Robber ────────────────────────────────────────────────────────────────
    if (pendingRobber) {
        return (
            <div>
                <p>Move the Robber to a new hex</p>
                <Button
                    variant={boardMode === 'moveRobber' ? 'warning' : 'danger'}
                    onClick={() => setBoardMode(boardMode === 'moveRobber' ? 'idle' : 'moveRobber')}
                >
                    {boardMode === 'moveRobber' ? '↩ Cancel' : 'Move Robber'}
                </Button>
            </div>
        );
    }

    // ── Pending road building ─────────────────────────────────────────────────
    if (pendingRoadBuilding > 0) {
        return (
            <div>
                <p>Road Building: place {pendingRoadBuilding} free road{pendingRoadBuilding > 1 ? 's' : ''}</p>
                <Button
                    variant={boardMode === 'placeRoad' ? 'warning' : 'success'}
                    onClick={() => setBoardMode(boardMode === 'placeRoad' ? 'idle' : 'placeRoad')}
                >
                    {boardMode === 'placeRoad' ? '↩ Cancel' : 'Place Free Road'}
                </Button>
            </div>
        );
    }

    // ── Pre-roll ──────────────────────────────────────────────────────────────
    if (!hasRolled) {
        const canPlayKnight = myDevCards && myDevCards.knight > 0 && !playedDevCard;
        return (
            <div>
                {canPlayKnight && (
                    <Button variant="outline-secondary" className="me-2"
                        onClick={() => submit(new SACPlayKnight())}>
                        ⚔️ Play Knight
                    </Button>
                )}
                <Button variant="primary" onClick={() => submit(new SACRollDice())}>
                    🎲 Roll Dice
                </Button>
            </div>
        );
    }

    // ── Post-roll ─────────────────────────────────────────────────────────────
    const res = myState.resources;
    const canBuildRoad = res.brick >= 1 && res.lumber >= 1 && myState.remainingRoads > 0;
    const canBuildSettlement = res.brick >= 1 && res.lumber >= 1 && res.wool >= 1 && res.grain >= 1 && myState.remainingSettlements > 0;
    const canBuildCity = res.grain >= 2 && res.ore >= 3 && myState.remainingCities > 0;
    const canBuyDevCard = res.wool >= 1 && res.grain >= 1 && res.ore >= 1 && gs.devCardDeckSize > 0;
    const canPlayRoadBuilding = myDevCards && myDevCards.roadBuilding > 0 && !playedDevCard;
    const canPlayYoP = myDevCards && myDevCards.yearOfPlenty > 0 && !playedDevCard;
    const canPlayMonopoly = myDevCards && myDevCards.monopoly > 0 && !playedDevCard;

    return (
        <div>
            <Row className="g-1 mb-2">
                <Col xs="auto">
                    <Button
                        variant={boardMode === 'placeRoad' ? 'warning' : canBuildRoad ? 'outline-primary' : 'outline-secondary'}
                        disabled={!canBuildRoad && boardMode !== 'placeRoad'}
                        onClick={() => setBoardMode(boardMode === 'placeRoad' ? 'idle' : 'placeRoad')}
                        title="1🧱 1🪵"
                    >
                        {boardMode === 'placeRoad' ? '↩ Cancel Road' : '🛤️ Road (1🧱1🪵)'}
                    </Button>
                </Col>
                <Col xs="auto">
                    <Button
                        variant={boardMode === 'placeSettlement' ? 'warning' : canBuildSettlement ? 'outline-primary' : 'outline-secondary'}
                        disabled={!canBuildSettlement && boardMode !== 'placeSettlement'}
                        onClick={() => setBoardMode(boardMode === 'placeSettlement' ? 'idle' : 'placeSettlement')}
                        title="1🧱 1🪵 1🐑 1🌾"
                    >
                        {boardMode === 'placeSettlement' ? '↩ Cancel Settlement' : '🏘️ Settlement (1🧱1🪵1🐑1🌾)'}
                    </Button>
                </Col>
                <Col xs="auto">
                    <Button
                        variant={boardMode === 'placeCity' ? 'warning' : canBuildCity ? 'outline-primary' : 'outline-secondary'}
                        disabled={!canBuildCity && boardMode !== 'placeCity'}
                        onClick={() => setBoardMode(boardMode === 'placeCity' ? 'idle' : 'placeCity')}
                        title="2🌾 3⛏️"
                    >
                        {boardMode === 'placeCity' ? '↩ Cancel City' : '🏰 City (2🌾3⛏️)'}
                    </Button>
                </Col>
                <Col xs="auto">
                    <Button
                        variant="outline-primary"
                        disabled={!canBuyDevCard}
                        onClick={() => submit(new SACBuyDevCard())}
                        title="1🐑 1🌾 1⛏️"
                    >
                        🃏 Buy Dev Card (1🐑1🌾1⛏️)
                    </Button>
                </Col>
            </Row>
            <Row className="g-1 mb-2">
                {canPlayRoadBuilding && (
                    <Col xs="auto">
                        <Button variant="outline-info" onClick={() => submit(new SACPlayRoadBuilding())}>
                            🃏 Road Building
                        </Button>
                    </Col>
                )}
                {canPlayYoP && (
                    <Col xs="auto">
                        <Button variant="outline-info" onClick={() => setShowYopModal(true)}>
                            🃏 Year of Plenty
                        </Button>
                    </Col>
                )}
                {canPlayMonopoly && (
                    <Col xs="auto">
                        <Button variant="outline-info" onClick={() => setShowMonopolyModal(true)}>
                            🃏 Monopoly
                        </Button>
                    </Col>
                )}
                <Col xs="auto">
                    <Button variant="outline-secondary" onClick={() => setShowTradeModal(true)}>
                        ⚖️ Maritime Trade
                    </Button>
                </Col>
            </Row>
            <Button variant="success" onClick={() => submit(new SACEndTurn())}>
                ✅ End Turn
            </Button>

            {/* ── Year of Plenty modal ── */}
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

            {/* ── Monopoly modal ── */}
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

            {/* ── Maritime trade modal ── */}
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
        </div>
    );
}
