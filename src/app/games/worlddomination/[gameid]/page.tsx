'use client'
import { use } from "react";
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { IWorldDominationGameDataResponse, IWorldDominationSpecificGameStateResponse } from "@/games/WorldDomination/apiModels";
import { ADJACENCY, TERRITORIES, isAdjacent, connectedThroughOwnedTerritories } from "@/games/WorldDomination/board";
import WorldDominationBoard from "@/games/WorldDomination/components/WorldDominationBoard";
import WorldDominationActions from "@/games/WorldDomination/components/WorldDominationActions";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecap from "@/components/games/TurnRecap";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { usePushEvents, TURN_ADVANCED_EVENTS } from "@/utils/hooks/usePushEvents";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { PLAYER_COLOURS } from "@/utils/ui/playerColours";
import { currentUsername } from "@/utils/ui/players";

const PHASE_LABEL: Record<IWorldDominationSpecificGameStateResponse['phase'], string> = {
    setup: 'Setup',
    reinforce: 'Reinforce',
    attack: 'Attack',
    fortify: 'Fortify',
};

export default function GameWorldDomination({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const [selFrom, setSelFrom] = useState<number | null>(null);
    const [selTo, setSelTo] = useState<number | null>(null);
    const [showLog, setShowLog] = useState(false);
    const router = useRouter();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<IWorldDominationGameDataResponse>(gameId);

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

    const { submitCommand, submitting, pendingTarget } = useSubmitCommand<IWorldDominationGameDataResponse>(gameId, user, setGameData, getGameData);

    const live = {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    };
    const nav = useTurnNavigation<IWorldDominationSpecificGameStateResponse>(gameId, live);
    const recap = useTurnRecap(gameId);
    const { endGame } = useEndGame(gameId);

    const gs = nav.displayedState;
    const complete = nav.displayedComplete;
    const isMyTurn = nav.isLive && user?.id === gameData?.currentTurn && !complete;
    const myUsername = currentUsername(user);

    const usernameList = gameData?.usernameList ?? [];
    function usernameToColor(username: string | null): string {
        if (!username) return '#888';
        const idx = usernameList.indexOf(username);
        return PLAYER_COLOURS[idx >= 0 ? idx % PLAYER_COLOURS.length : 0];
    }

    // Selecting territories is a live-only interaction; drop any in-progress
    // selection whenever the phase changes (including server-driven ones like
    // Reinforce auto-advancing to Attack) or when we leave the live view.
    useEffect(() => {
        setSelFrom(null);
        setSelTo(null);
    }, [gs?.phase, nav.isLive]);

    const validTerritories = useMemo(() => {
        const s = new Set<number>();
        if (!gs || !isMyTurn) return s;
        const territories = gs.territories;

        const deploying = gs.phase === 'setup' || gs.phase === 'reinforce'
            || (gs.phase === 'attack' && gs.reinforcementsRemaining > 0);
        if (deploying) {
            territories.forEach((t, id) => { if (t.owner === myUsername) s.add(id); });
            return s;
        }

        if (gs.phase === 'attack' && !gs.pendingOccupation) {
            if (selFrom === null) {
                territories.forEach((t, id) => { if (t.owner === myUsername && t.armies >= 2) s.add(id); });
            } else if (selTo === null) {
                ADJACENCY[selFrom].forEach(id => {
                    const t = territories[id];
                    if (t.owner && t.owner !== myUsername) s.add(id);
                });
            }
            return s;
        }

        if (gs.phase === 'fortify' && !gs.fortifyUsed) {
            if (selFrom === null) {
                territories.forEach((t, id) => { if (t.owner === myUsername && t.armies >= 2) s.add(id); });
            } else if (selTo === null) {
                territories.forEach((t, id) => {
                    if (id !== selFrom && t.owner === myUsername
                        && connectedThroughOwnedTerritories(selFrom, id, myUsername, territories)) {
                        s.add(id);
                    }
                });
            }
        }
        return s;
    }, [gs, isMyTurn, selFrom, selTo, myUsername]);

    function handleTerritoryClick(id: number) {
        if (!gs || !isMyTurn) return;
        const t = gs.territories[id];

        const deploying = gs.phase === 'setup' || gs.phase === 'reinforce'
            || (gs.phase === 'attack' && gs.reinforcementsRemaining > 0);
        if (deploying) {
            if (t.owner === myUsername) setSelFrom(id);
            return;
        }

        if (gs.phase === 'attack') {
            if (gs.pendingOccupation) return;
            if (selFrom === null) {
                if (t.owner === myUsername && t.armies >= 2) setSelFrom(id);
            } else if (selTo === null) {
                if (t.owner !== myUsername && isAdjacent(selFrom, id)) setSelTo(id);
            } else if (t.owner === myUsername && t.armies >= 2) {
                setSelFrom(id);
                setSelTo(null);
            }
            return;
        }

        if (gs.phase === 'fortify') {
            if (gs.fortifyUsed) return;
            if (selFrom === null) {
                if (t.owner === myUsername && t.armies >= 2) setSelFrom(id);
            } else if (selTo === null) {
                if (t.owner === myUsername && id !== selFrom
                    && connectedThroughOwnedTerritories(selFrom, id, myUsername, gs.territories)) {
                    setSelTo(id);
                }
            } else if (t.owner === myUsername && t.armies >= 2) {
                setSelFrom(id);
                setSelTo(null);
            }
        }
    }

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
            const phaseLabel = PHASE_LABEL[gs.phase];
            subtitle = isMyTurn
                ? <><span className="ag-hi">Your move</span> · {phaseLabel} phase</>
                : <>{currentTurnUsername}&apos;s move · {phaseLabel}</>;
        }
    }

    // ── Scoreboard ────────────────────────────────────────────────────────────
    const scoreEntries: ScoreEntry[] = gs
        ? usernameList.flatMap((username, i): ScoreEntry[] => {
            const ps = gs.playerStates?.[username];
            if (!ps) return [];
            const isMe = username === myUsername;
            const isActive = username === currentTurnUsername && !complete;
            let sub: React.ReactNode;
            if (ps.eliminated) sub = '💀 out';
            else if (isActive) sub = `▶ now · ${PHASE_LABEL[gs.phase]}`;
            else sub = `🃏 ${ps.cards.length}`;
            return [{
                id: username,
                name: isMe ? 'You' : username,
                color: PLAYER_COLOURS[i % PLAYER_COLOURS.length],
                sub,
                score: ps.territoryCount,
                isMe,
                isActive,
            }];
        })
        : [];

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

    let placementPrompt: string | null = null;
    if (gs && isMyTurn && !complete) {
        if (gs.phase === 'setup' || gs.phase === 'reinforce' || (gs.phase === 'attack' && gs.reinforcementsRemaining > 0)) {
            placementPrompt = `◆ ${gs.reinforcementsRemaining} to place`;
        } else if (gs.phase === 'attack' && !gs.pendingOccupation && selFrom === null) {
            placementPrompt = '⚔ tap a territory to attack from';
        } else if (gs.phase === 'fortify' && !gs.fortifyUsed && selFrom === null) {
            placementPrompt = '🚩 tap a territory to fortify from';
        }
    }

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
        <GameShell title="World Domination" subtitle={subtitle} right={optionsMenu} syncing={submitting}>
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {complete && (
                <GameFinishBanner
                    message={currentUserWon ? 'You won! 🎉' : `${getWinnerDisplayName()} achieved world domination.`}
                    gameId={gameId}
                    gameUrl="worlddomination"
                    usernameList={usernameList}
                    myUsername={myUsername}
                    turnTimer={gameData?.turnTimer}
                />
            )}

            {gs && (
                <>
                    <div className="ag-board-area">
                        <WorldDominationBoard
                            territories={gs.territories}
                            usernameToColor={usernameToColor}
                            onTerritoryClick={isMyTurn && !complete && !submitting ? handleTerritoryClick : undefined}
                            validTerritories={validTerritories}
                            selectedTerritoryId={selFrom}
                            frontLine={gs.lastBattle ? { fromTerritoryId: gs.lastBattle.fromTerritoryId, toTerritoryId: gs.lastBattle.toTerritoryId } : null}
                            placementPrompt={placementPrompt}
                        />
                    </div>

                    {isMyTurn && !complete && (
                        <WorldDominationActions
                            gs={gs}
                            myUsername={myUsername}
                            selFrom={selFrom}
                            selTo={selTo}
                            setSelFrom={setSelFrom}
                            setSelTo={setSelTo}
                            submitCommand={submitCommand}
                            pendingTarget={pendingTarget}
                        />
                    )}

                    <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} />

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
