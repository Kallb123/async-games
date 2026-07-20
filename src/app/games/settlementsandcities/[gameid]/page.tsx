'use client'
import { use } from "react";
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import type { ISACGameDataResponse, ISACSpecificGameStateResponse } from "@/games/SettlementsAndCities/apiModels";
import type { SAC_Resource } from "@/games/SettlementsAndCities/board";
import { BOARD_TOPOLOGY, isValidSettlementVertex, isValidRoadEdge, isValidSetupRoadEdge } from "@/games/SettlementsAndCities/board";
import { enabledExpansionNames, normaliseExpansions } from "@/games/SettlementsAndCities/expansions";
import SettlementsAndCitiesBoard from "@/components/games/SettlementsAndCities/SettlementsAndCitiesBoard";
import SettlementsAndCitiesActions, { SACBoardMode } from "@/components/games/SettlementsAndCities/SettlementsAndCitiesActions";
import GameShell from "@/components/ui/GameShell";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import TurnNavControls from "@/components/games/TurnNavControls";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import {
    SACPlaceSettlementSetup,
    SACPlaceRoadSetup,
    SACBuildSettlement,
    SACBuildRoad,
    SACBuildCity,
    SACMoveRobber,
} from "@/utils/apiModels/GameLogic";

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

const RESOURCE_ORDER: SAC_Resource[] = ['lumber', 'wool', 'grain', 'brick', 'ore'];
const RESOURCE_EMOJI: Record<SAC_Resource, string> = {
    lumber: '🪵', wool: '🐑', grain: '🌾', brick: '🧱', ore: '⛏️',
};

const PLACEMENT_PROMPT: Partial<Record<SACBoardMode, string>> = {
    placeSettlementSetup: 'Tap a spot to place your settlement →',
    placeSettlement: 'Tap a spot to build a settlement →',
    placeCity: 'Tap a settlement to upgrade →',
    placeRoadSetup: 'Tap an edge to place your road →',
    placeRoad: 'Tap an edge to place a road →',
    moveRobber: 'Tap a hex to move the robber →',
};

export default function GameSettlementsAndCities({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const [gameData, setGameData] = useState({} as ISACGameDataResponse);
    const [boardMode, setBoardMode] = useState<SACBoardMode>('idle');
    const [showLog, setShowLog] = useState(false);
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

    // Turn recap: replay past turns and render the reconstructed board read-only.
    // While reviewing (nav not live) `gs` is the historical snapshot rather than
    // the live state, and interactive controls are disabled.
    const live = {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    };
    const nav = useTurnNavigation<ISACSpecificGameStateResponse>(gameId, live);
    const recapAvailable = gameData?.recapAvailable ?? false;

    const gs = nav.displayedState;
    const complete = nav.displayedComplete;
    // Only the live active player can act; reviewing a past turn is read-only.
    const isMyTurn = nav.isLive && user?.id === gameData?.currentTurn;
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

    const displayedWinner = nav.displayedWinner;
    const displayedCurrentTurn = nav.displayedCurrentTurn;

    const getWinnerDisplayName = (): string => {
        const playerStates = gs?.playerStates;
        if (!playerStates) return displayedWinner ?? '';
        return Object.values(playerStates).find(p => p.userId === displayedWinner)?.username ?? displayedWinner ?? '';
    };

    const currentTurnUsername = gs
        ? Object.values(gs.playerStates).find(p => p.userId === displayedCurrentTurn)?.username ?? displayedCurrentTurn ?? ''
        : displayedCurrentTurn ?? '';

    const currentUserWon = complete && user?.id !== undefined && user.id === displayedWinner;

    // ── Top-bar status line ──────────────────────────────────────────────────
    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (complete) {
            subtitle = currentUserWon ? '🏆 You won!' : `${getWinnerDisplayName()} won`;
        } else if (gs.phase === 'setup') {
            subtitle = <><b>Setup</b> · step {gs.setupStep + 1} · {isMyTurn ? 'your move' : `${currentTurnUsername}'s move`}</>;
        } else if (isMyTurn) {
            subtitle = gs.hasRolled
                ? <>You rolled <b>{gs.lastRoll}</b> · build or end turn</>
                : <><span className="ag-hi">Your move</span> · roll the dice</>;
        } else {
            subtitle = <>{currentTurnUsername}&apos;s move</>;
        }
    }

    // ── Scoreboard entries ───────────────────────────────────────────────────
    const scoreEntries: ScoreEntry[] = gs
        ? usernameList.flatMap((username, i): ScoreEntry[] => {
            const ps = gs.playerStates?.[username];
            if (!ps) return [];
            const isMe = username === myUsername;
            const isActive = username === currentTurnUsername && !complete;
            const totalCards = Object.values(ps.resources ?? {}).reduce((s, n) => s + n, 0);
            let sub: React.ReactNode;
            if (isActive) sub = '▶ now';
            else if (gs.longestRoadOwner === username) sub = '🛣️ LR';
            else if (gs.largestArmyOwner === username) sub = '⚔️ LA';
            else sub = `${totalCards} cards`;
            return [{
                id: username,
                name: isMe ? 'You' : username,
                color: PLAYER_COLORS[i % PLAYER_COLORS.length],
                sub,
                score: ps.visibleVP,
                isMe,
                isActive,
            }];
        })
        : [];

    // ── Your hand ────────────────────────────────────────────────────────────
    const myState = gs?.playerStates?.[myUsername];
    const myDevCards = gs?.playerDevCards?.[myUsername];
    const myDevCount = myDevCards ? Object.values(myDevCards).reduce((s, n) => s + n, 0) : 0;
    const myHandTotal = myState ? Object.values(myState.resources ?? {}).reduce((s, n) => s + n, 0) : 0;

    const logButton = gs ? (
        <button
            className={`ag-game-topbar-btn${showLog ? ' ag-game-topbar-btn--on' : ''}`}
            onClick={() => setShowLog(v => !v)}
            aria-label="Game log"
        >📜</button>
    ) : undefined;

    return (
        <GameShell title="Settlements & Cities" subtitle={subtitle} right={logButton}>
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {gs && (
                <p className="ag-hint" style={{ textAlign: "center", marginTop: 4 }}>
                    {(() => {
                        const names = enabledExpansionNames(normaliseExpansions(gs.expansions));
                        const target = gs.victoryTarget ?? 10;
                        return names.length > 0
                            ? <>First to <b>{target} VP</b> · {names.join(' + ')}</>
                            : <>First to <b>{target} VP</b> wins</>;
                    })()}
                </p>
            )}

            {recapAvailable && gs && (
                <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} />
            )}

            {complete && (
                <div className="ag-game-result">
                    <h2>{currentUserWon ? 'You won! 🎉' : `${getWinnerDisplayName()} won! Better luck next time.`}</h2>
                </div>
            )}

            {gs && (
                <>
                    <div className="ag-board-area">
                        <SettlementsAndCitiesBoard
                            hexes={gs.hexes}
                            vertices={gs.vertices}
                            edges={gs.edges}
                            harbors={gs.harbors}
                            robberHexIndex={gs.robberHexIndex}
                            usernameToColor={usernameToColor}
                            onVertexClick={isMyTurn && !complete ? handleVertexClick : undefined}
                            onEdgeClick={isMyTurn && !complete ? handleEdgeClick : undefined}
                            onHexClick={isMyTurn && !complete ? handleHexClick : undefined}
                            validVertices={validVertices}
                            validEdges={validEdges}
                            validHexes={validHexes}
                            lastRoll={gs.lastRoll}
                            placementPrompt={boardMode !== 'idle' ? PLACEMENT_PROMPT[boardMode] ?? null : null}
                        />
                    </div>

                    {myState && !complete && (
                        <div className="ag-hand">
                            <div className="ag-hand-head">
                                <span className="ag-hand-title">Your hand · {myHandTotal} card{myHandTotal !== 1 ? 's' : ''}</span>
                                {myDevCount > 0 && (
                                    <span className="ag-hand-note">🃏 {myDevCount} dev card{myDevCount !== 1 ? 's' : ''}</span>
                                )}
                            </div>
                            <div className="ag-hand-cards">
                                {RESOURCE_ORDER.map(r => {
                                    const n = myState.resources?.[r] ?? 0;
                                    return (
                                        <div key={r} className={`ag-hand-card${n === 0 ? ' ag-hand-card--empty' : ''}`}>
                                            <div className="ag-hand-emoji">{RESOURCE_EMOJI[r]}</div>
                                            <div className="ag-hand-count">{n}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {isMyTurn && !complete && (
                        <SettlementsAndCitiesActions
                            gs={gs}
                            myUsername={myUsername}
                            myUserId={user?.id ?? ''}
                            boardMode={boardMode}
                            setBoardMode={setBoardMode}
                            submitCommand={submitCommand}
                        />
                    )}

                    {showLog && (
                        <div className="ag-log">
                            <ul className="ag-log-list">
                                {nav.displayedHistory.slice().reverse().map((h, i) => (
                                    <li key={i} className="ag-log-item">{h}</li>
                                ))}
                                {nav.displayedHistory.length === 0 && (
                                    <li className="ag-log-item">No moves yet.</li>
                                )}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </GameShell>
    );
}
