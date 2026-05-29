'use client'
import React from 'react';
import { Badge, Card } from 'react-bootstrap';
import type { ISACPlayerStateResponse } from '@/games/SettlementsAndCities/apiModels';
import type { SAC_DevCard } from '@/games/SettlementsAndCities/board';

interface SettlementsAndCitiesPlayerPanelProps {
    username: string;
    playerState: ISACPlayerStateResponse;
    devCards: { [K in SAC_DevCard]: number } | undefined;
    color: string;
    isCurrentTurn: boolean;
    isMe: boolean;
    longestRoadOwner: string | null;
    largestArmyOwner: string | null;
}

const RESOURCE_EMOJI: Record<string, string> = {
    lumber: '🪵', wool: '🐑', grain: '🌾', brick: '🧱', ore: '⛏️',
};

export default function SettlementsAndCitiesPlayerPanel({
    username,
    playerState,
    devCards,
    color,
    isCurrentTurn,
    isMe,
    longestRoadOwner,
    largestArmyOwner,
}: SettlementsAndCitiesPlayerPanelProps) {
    if (!playerState) return null;

    const resources = playerState.resources ?? {};
    const totalCards = Object.values(resources).reduce((s, n) => s + n, 0);

    return (
        <Card
            className="mb-2"
            style={{ borderColor: color, borderWidth: isCurrentTurn ? 3 : 1 }}
        >
            <Card.Header style={{ background: color, color: '#fff' }}>
                <strong>{username}</strong>
                {isCurrentTurn && <Badge bg="light" text="dark" className="ms-2">▶ Active</Badge>}
                {isMe && <Badge bg="secondary" className="ms-2">You</Badge>}
                <span className="float-end">
                    🏆 {playerState.visibleVP} VP
                    {longestRoadOwner === username && <span className="ms-1" title="Longest Road">🛣️ LR</span>}
                    {largestArmyOwner === username && <span className="ms-1" title="Largest Army">⚔️ LA</span>}
                </span>
            </Card.Header>
            <Card.Body className="py-2 px-3">
                <div className="mb-1" style={{ fontSize: '0.85rem' }}>
                    <strong>Resources ({totalCards}):</strong>{' '}
                    {(['lumber', 'wool', 'grain', 'brick', 'ore'] as const).map(r => (
                        resources[r] > 0 ? (
                            <span key={r} className="me-1">
                                {RESOURCE_EMOJI[r]}{resources[r]}
                            </span>
                        ) : null
                    ))}
                    {totalCards === 0 && <span className="text-muted">none</span>}
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                    <strong>Pieces:</strong>{' '}
                    🏘️ {playerState.remainingSettlements ?? 0} settlements &middot;{' '}
                    🏰 {playerState.remainingCities ?? 0} cities &middot;{' '}
                    🛤️ {playerState.remainingRoads ?? 0} roads
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                    <strong>Knights played:</strong> {playerState.knightsPlayed ?? 0}
                    {isMe && devCards && (
                        <span className="ms-2">
                            <strong>Dev cards:</strong>{' '}
                            {Object.entries(devCards).map(([k, v]) =>
                                v > 0 ? <span key={k} className="me-1">{k} ×{v}</span> : null
                            )}
                            {Object.values(devCards).every(v => v === 0) && <span className="text-muted">none</span>}
                        </span>
                    )}
                    {!isMe && (
                        <span className="ms-2 text-muted">
                            {playerState.devCardCount ?? 0 > 0
                                ? `${playerState.devCardCount ?? 0} dev card${(playerState.devCardCount ?? 0) !== 1 ? 's' : ''}`
                                : ''}
                        </span>
                    )}
                </div>
            </Card.Body>
        </Card>
    );
}
