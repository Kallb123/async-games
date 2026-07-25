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
import { SAC_DEV_CARD_META, SAC_DEV_CARD_ORDER } from "@/games/SettlementsAndCities/ui";
import SettlementsAndCitiesBoard from "@/games/SettlementsAndCities/components/SettlementsAndCitiesBoard";
import SettlementsAndCitiesActions, { SACBoardMode } from "@/games/SettlementsAndCities/components/SettlementsAndCitiesActions";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecap from "@/components/games/TurnRecap";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { usePushEvents, TURN_ADVANCED_EVENTS } from "@/utils/hooks/usePushEvents";
import { useGameData } from "@/utils/hooks/useGameData";
import { PLAYER_COLOURS } from "@/utils/ui/playerColours";
import {
    SACPlaceSettlementSetup,
    SACPlaceRoadSetup,
    SACBuildSettlement,
    SACBuildRoad,
    SACBuildCity,
    SACMoveRobber,
} from "@/utils/apiModels/GameLogic";

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
    const [boardMode, setBoardMode] = useState<SACBoardMode>('idle');
    const [showLog, setShowLog] = useState(false);
    const router = useRouter();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<ISACGameDataResponse>(gameId);

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
    }, [isLoaded]);

    usePushEvents(TURN_ADVANCED_EVENTS, () => getGameData(), { refreshOnVisible: true });

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

    // "Since you were last here": on open, if opponents moved since our last turn,
    // show the recap intro before the board. Dismissing (or the CTA) reveals it.
    const recap = useTurnRecap(gameId);
    const { endGame } = useEndGame(gameId);

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
        return PLAYER_COLOURS[idx >= 0 ? idx % PLAYER_COLOURS.length : 0];
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
        } else {
            let turnText: React.ReactNode;
            if (gs.phase === 'setup') {
                turnText = <><b>Setup</b> · step {gs.setupStep + 1} · {isMyTurn ? 'your move' : `${currentTurnUsername}'s move`}</>;
            } else if (gs.specialBuildActive) {
                turnText = isMyTurn
                    ? <><span className="ag-hi">⚡ Special Build</span> · build or trade, then pass</>
                    : <>⚡ Special Build · {currentTurnUsername}&apos;s move</>;
            } else if (isMyTurn) {
                turnText = gs.hasRolled
                    ? <>You rolled <b>{gs.lastRoll}</b> · build or end turn</>
                    : <><span className="ag-hi">Your move</span> · roll the dice</>;
            } else {
                turnText = <>{currentTurnUsername}&apos;s move</>;
            }
            const expansionNames = enabledExpansionNames(normaliseExpansions(gs.expansions));
            subtitle = expansionNames.length > 0
                ? <>{turnText} · {expansionNames.join(' + ')}</>
                : turnText;
        }
    }

    // ── Scoreboard entries ───────────────────────────────────────────────────
    const victoryTarget = gs?.victoryTarget ?? 10;
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
                color: PLAYER_COLOURS[i % PLAYER_COLOURS.length],
                sub,
                score: <>{ps.visibleVP}<span className="ag-score-vp-target">/{victoryTarget}</span></>,
                isMe,
                isActive,
            }];
        })
        : [];

    // ── Your hand ────────────────────────────────────────────────────────────
    const myState = gs?.playerStates?.[myUsername];
    const myDevCards = gs?.playerDevCards?.[myUsername];
    const myNewDevCards = gs?.playerNewDevCards?.[myUsername];
    const myDevCount = myDevCards ? Object.values(myDevCards).reduce((s, n) => s + n, 0) : 0;
    const myNewDevCount = myNewDevCards ? Object.values(myNewDevCards).reduce((s, n) => s + n, 0) : 0;
    const myHandTotal = myState ? Object.values(myState.resources ?? {}).reduce((s, n) => s + n, 0) : 0;

    const menuOptions: GameOption[] = [
        ...(recap.hasRecap ? [{
            key: 'recap',
            label: 'Show last recap',
            icon: '🔁',
            onClick: recap.reshow,
        }] : []),
        {
            key: 'history',
            label: 'Turn history',
            icon: '📜',
            active: showLog,
            onClick: () => setShowLog(v => !v),
        },
        ...(!complete ? [{
            key: 'end',
            label: 'End game',
            icon: '🏳️',
            danger: true,
            onClick: endGame,
        }] : []),
    ];
    const optionsMenu = gs ? <GameOptionsMenu options={menuOptions} /> : undefined;

    // Recap intro: a standalone welcome-back screen shown before the board when
    // it's our turn and moves happened while we were away.
    if (recap.show && recap.recap?.hasRecap && recap.recap.header && recap.recap.summary && recap.recap.events) {
        const r = recap.recap;
        return (
            <TurnRecap
                header={r.header!}
                summary={r.summary!}
                events={r.events!.map((e) => ({
                    id: e.id,
                    glyph: e.glyph,
                    title: e.title,
                    detail: e.detail,
                    timestamp: e.timestamp,
                    dotColour: e.dotColour,
                    reaction: e.reaction,
                }))}
                tip={r.tip}
                cta={{ label: "Take your turn →", onClick: recap.dismiss }}
                backHref="/"
                onReact={recap.react}
            />
        );
    }

    return (
        <GameShell title="Settlements & Cities" subtitle={subtitle} right={optionsMenu}>
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

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

                            {(myDevCount > 0 || myNewDevCount > 0) && (
                                <div className="ag-hand-devs">
                                    {SAC_DEV_CARD_ORDER.map(card => {
                                        const meta = SAC_DEV_CARD_META[card];
                                        const playable = myDevCards?.[card] ?? 0;
                                        const fresh = myNewDevCards?.[card] ?? 0;
                                        const total = playable + fresh;
                                        if (total === 0) return null;
                                        return (
                                            <span key={card} className="ag-devchip" title={meta.blurb}>
                                                <span className="ag-devchip-emoji">{meta.emoji}</span>
                                                <span className="ag-devchip-name">{meta.name}</span>
                                                <span className="ag-devchip-count">{total}</span>
                                                {fresh > 0 && <span className="ag-devchip-new" title="Bought this turn — playable next turn">+{fresh} new</span>}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
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

                    {recapAvailable && (
                        <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} />
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
