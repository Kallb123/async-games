'use client'
import { use } from "react";
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Col, Row } from "react-bootstrap";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import GameResult from "@/components/GameResult";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import type { ISACGameDataResponse } from "@/games/SettlementsAndCities/apiModels";
import { BOARD_TOPOLOGY, isValidSettlementVertex, isValidRoadEdge, isValidSetupRoadEdge } from "@/games/SettlementsAndCities/board";
import SettlementsAndCitiesBoard from "@/components/games/SettlementsAndCities/SettlementsAndCitiesBoard";
import SettlementsAndCitiesPlayerPanel from "@/components/games/SettlementsAndCities/SettlementsAndCitiesPlayerPanel";
import SettlementsAndCitiesActions, { SACBoardMode } from "@/components/games/SettlementsAndCities/SettlementsAndCitiesActions";
import {
    SACPlaceSettlementSetup,
    SACPlaceRoadSetup,
    SACBuildSettlement,
    SACBuildRoad,
    SACBuildCity,
    SACMoveRobber,
} from "@/utils/apiModels/GameLogic";

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

export default function GameSettlementsAndCities({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const [gameData, setGameData] = useState({} as ISACGameDataResponse);
    const [boardMode, setBoardMode] = useState<SACBoardMode>('idle');
    const router = useRouter();

    const { gameid } = use(params);
    const gameId = gameid;

    useEffect(() => {
        if (isLoaded) {
            if (!user) {
                router.push('/login');
            }
            const unlocked = user?.publicMetadata.unlocked;
            if (unlocked !== true) {
                router.push('/unlockaccess');
            }
            getGameData();
        }
        const handleTurnTaken = () => {
            console.log(`SettlementsAndCitiesPage: TurnTaken`);
            getGameData();
        };
        window.addEventListener('TurnTaken', handleTurnTaken);
        return () => window.removeEventListener('TurnTaken', handleTurnTaken);
    }, [isLoaded]);

    const getGameData = async () => {
        fetch(`/api/game/${gameId}`)
            .then(r => {
                if (!r.ok) throw new Error('Game not found');
                return r.json();
            })
            .then(data => {
                if (data) setGameData(data.gameData);
            })
            .catch(err => {
                console.error(err);
                router.push('/');
            });
    };

    const submitCommand = async (command: IGameCommand, callback: (r: ICommandResponse) => void) => {
        command.gameId = gameId;
        if (!user) { console.error('Not logged in'); return; }
        command.senderId = user.id;
        command.senderUsername = user.username || user.firstName || user.id;
        fetch('/api/game/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(command),
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data?.gameData) return;
                setGameData(data.gameData as ISACGameDataResponse);
                setBoardMode('idle');
                callback(data);
            });
    };

    const gs = gameData?.specificGameState;
    const isMyTurn = user?.id === gameData?.currentTurn;
    const myUsername = user?.username || user?.firstName || user?.id || '';

    // Map username → color
    const usernameList = gameData?.usernameList ?? [];
    function usernameToColor(username: string | null): string {
        if (!username) return '#888';
        const idx = usernameList.indexOf(username);
        return PLAYER_COLORS[idx >= 0 ? idx % PLAYER_COLORS.length : 0];
    }

    // Build username → userId from playerStates (each has a userId field)
    const usernameToUserId: Record<string, string> = {};
    if (gs?.playerStates) {
        for (const [uname, ps] of Object.entries(gs.playerStates)) {
            usernameToUserId[uname] = ps.userId;
        }
    }

    // Compute valid placements for board interaction
    const validVertices = new Set<number>();
    const validEdges = new Set<number>();
    const validHexes = new Set<number>();

    if (gs && isMyTurn && !gameData.complete) {
        const vertices = gs.vertices;
        const edges = gs.edges;

        if (boardMode === 'placeSettlementSetup') {
            for (let vid = 0; vid < BOARD_TOPOLOGY.numVertices; vid++) {
                if (isValidSettlementVertex(vid, vertices as any)) validVertices.add(vid);
            }
        } else if (boardMode === 'placeRoadSetup' && gs.lastSetupSettlementVertex !== null) {
            const sv = gs.lastSetupSettlementVertex;
            for (const eid of BOARD_TOPOLOGY.vertexEdges[sv]) {
                if (isValidSetupRoadEdge(eid, sv, edges as any)) validEdges.add(eid);
            }
        } else if (boardMode === 'placeSettlement') {
            for (let vid = 0; vid < BOARD_TOPOLOGY.numVertices; vid++) {
                if (!isValidSettlementVertex(vid, vertices as any)) continue;
                const connectedByRoad = BOARD_TOPOLOGY.vertexEdges[vid].some(
                    eid => edges[eid].hasRoad && edges[eid].owner === myUsername
                );
                if (connectedByRoad) validVertices.add(vid);
            }
        } else if (boardMode === 'placeCity') {
            for (let vid = 0; vid < BOARD_TOPOLOGY.numVertices; vid++) {
                const v = vertices[vid];
                if (v.building === 'settlement' && v.owner === myUsername) validVertices.add(vid);
            }
        } else if (boardMode === 'placeRoad') {
            for (let eid = 0; eid < BOARD_TOPOLOGY.numEdges; eid++) {
                if (isValidRoadEdge(eid, myUsername, vertices as any, edges as any)) validEdges.add(eid);
            }
        } else if (boardMode === 'moveRobber') {
            for (let hid = 0; hid < (gs.hexes?.length ?? 0); hid++) {
                if (hid !== gs.robberHexIndex) validHexes.add(hid);
            }
        }
    }

    // Board click handlers
    const handleVertexClick = (vertexId: number) => {
        if (!isMyTurn || !gs) return;
        if (boardMode === 'placeSettlementSetup') {
            const cmd = new SACPlaceSettlementSetup();
            cmd.vertexId = vertexId;
            submitCommand(cmd, () => { });
        } else if (boardMode === 'placeSettlement') {
            const cmd = new SACBuildSettlement();
            cmd.vertexId = vertexId;
            submitCommand(cmd, () => { });
        } else if (boardMode === 'placeCity') {
            const cmd = new SACBuildCity();
            cmd.vertexId = vertexId;
            submitCommand(cmd, () => { });
        }
    };

    const handleEdgeClick = (edgeId: number) => {
        if (!isMyTurn || !gs) return;
        if (boardMode === 'placeRoadSetup') {
            const cmd = new SACPlaceRoadSetup();
            cmd.edgeId = edgeId;
            submitCommand(cmd, () => { });
        } else if (boardMode === 'placeRoad') {
            const cmd = new SACBuildRoad();
            cmd.edgeId = edgeId;
            submitCommand(cmd, () => { });
        }
    };

    const handleHexClick = (hexId: number) => {
        if (!isMyTurn || !gs || boardMode !== 'moveRobber') return;

        // Find eligible adjacent players (those with settlements/cities on adjacent vertices with resources)
        const adjacentUsernames = new Set<string>();
        for (const vid of BOARD_TOPOLOGY.hexVertices[hexId]) {
            const v = gs.vertices[vid];
            if (v.owner && v.owner !== myUsername && v.building) {
                const ps = gs.playerStates[v.owner];
                const total = ps ? Object.values(ps.resources ?? {}).reduce((s, n) => s + n, 0) : 0;
                if (total > 0) adjacentUsernames.add(v.owner);
            }
        }

        const stealFrom = adjacentUsernames.size > 0
            ? usernameToUserId[Array.from(adjacentUsernames)[0]] ?? null
            : null;

        const cmd = new SACMoveRobber();
        cmd.hexId = hexId;
        cmd.stealFromUserId = stealFrom;
        submitCommand(cmd, () => { });
    };

    const getWinnerDisplayName = (): string => {
        const playerStates = gs?.playerStates;
        if (!playerStates) return gameData?.winner ?? '';
        return Object.values(playerStates).find(p => p.userId === gameData.winner)?.username ?? gameData?.winner ?? '';
    };

    const currentTurnUsername = gs
        ? Object.values(gs.playerStates).find(p => p.userId === gameData?.currentTurn)?.username ?? gameData?.currentTurn ?? ''
        : gameData?.currentTurn ?? '';

    return (
        <main>
            <h1>Settlements and Cities</h1>
            <h2><a href="/">Home</a></h2>
            <GameResult
                complete={gameData?.complete ?? false}
                winnerId={gameData?.winner ?? ''}
                currentUserId={user?.id}
                winnerDisplayName={getWinnerDisplayName()}
            />

            {gs && (
                <>
                    {gs.lastRoll !== null && (
                        <p>Last roll: <strong>{gs.lastRoll}</strong></p>
                    )}
                    <p>
                        Phase: <strong>{gs.phase}</strong>
                        {gs.phase === 'setup' && ` (step ${gs.setupStep + 1})`}
                        &nbsp;· Active: <strong>{currentTurnUsername}</strong>
                        &nbsp;· Dev deck: {gs.devCardDeckSize ?? 0} cards
                    </p>

                    <Row>
                        <Col md={8}>
                            <SettlementsAndCitiesBoard
                                hexes={gs.hexes}
                                vertices={gs.vertices}
                                edges={gs.edges}
                                harbors={gs.harbors}
                                robberHexIndex={gs.robberHexIndex}
                                usernameToColor={usernameToColor}
                                onVertexClick={isMyTurn && !gameData.complete ? handleVertexClick : undefined}
                                onEdgeClick={isMyTurn && !gameData.complete ? handleEdgeClick : undefined}
                                onHexClick={isMyTurn && !gameData.complete ? handleHexClick : undefined}
                                validVertices={validVertices}
                                validEdges={validEdges}
                                validHexes={validHexes}
                            />
                        </Col>
                        <Col md={4}>
                            {usernameList.map((username, i) => {
                                const ps = gs.playerStates?.[username];
                                if (!ps) return null;
                                return (
                                    <SettlementsAndCitiesPlayerPanel
                                        key={username}
                                        username={username}
                                        playerState={ps}
                                        devCards={gs.playerDevCards?.[username]}
                                        color={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                                        isCurrentTurn={username === currentTurnUsername}
                                        isMe={username === myUsername}
                                        longestRoadOwner={gs.longestRoadOwner}
                                        largestArmyOwner={gs.largestArmyOwner}
                                    />
                                );
                            })}

                            {isMyTurn && !gameData?.complete && (
                                <div className="mt-3">
                                    <h5>Your Turn</h5>
                                    <SettlementsAndCitiesActions
                                        gs={gs}
                                        myUsername={myUsername}
                                        myUserId={user?.id ?? ''}
                                        boardMode={boardMode}
                                        setBoardMode={setBoardMode}
                                        submitCommand={submitCommand}
                                    />
                                </div>
                            )}
                        </Col>
                    </Row>
                </>
            )}

            <h2>History</h2>
            <Row>
                <Col>
                    <ul>
                        {gameData?.gameState?.history?.map((h, i) => (
                            <li key={i}>{h}</li>
                        ))}
                    </ul>
                </Col>
            </Row>
            <CurrentUserInfo />
            <FcmTokenComp />
        </main>
    );
}
