'use client'
import { use } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { IWorldDominationGameDataResponse, IWorldDominationSpecificGameStateResponse } from "@/games/WorldDomination/apiModels";
import { ADJACENCY, TERRITORIES, isAdjacent, connectedThroughOwnedTerritories } from "@/games/WorldDomination/board";
import WorldDominationBoard from "@/games/WorldDomination/components/WorldDominationBoard";
import WorldDominationActions from "@/games/WorldDomination/components/WorldDominationActions";
import GameShell from "@/components/ui/GameShell";
import ReadOnlyPanel from "@/components/ui/ReadOnlyPanel";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecapScreen from "@/components/games/TurnRecapScreen";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { PLAYER_COLOURS, playerColourForId } from "@/utils/ui/playerColours";
import { abandonedGameStatus, nameForUserId } from "@/utils/ui/players";
import MatchHistory from "@/components/games/MatchHistory";

const PHASE_LABEL: Record<IWorldDominationSpecificGameStateResponse['phase'], string> = {
    setup: 'Setup',
    reinforce: 'Reinforce',
    attack: 'Attack',
    fortify: 'Fortify',
};

export default function GameWorldDomination({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();
    const [showLog, setShowLog] = useState(false);

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<IWorldDominationGameDataResponse>(gameId);

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
    const myUserId = user?.id ?? '';

    const usernameList = gameData?.usernameList ?? [];
    const userIdList = gameData?.userIdList ?? [];
    function colorForOwner(owner: string | null): string {
        if (!owner) return '#888';
        return playerColourForId(owner, userIdList);
    }

    // Selecting territories is a live-only interaction; drop any in-progress
    // selection whenever the phase changes (including server-driven ones like
    // Reinforce auto-advancing to Attack) or when we leave the live view.
    const selectionPhase = `${gs?.phase}:${nav.isLive}`;
    const [selFrom, setSelFrom] = useResettingState<number | null>(null, selectionPhase);
    const [selTo, setSelTo] = useResettingState<number | null>(null, selectionPhase);

    const validTerritories = useMemo(() => {
        const s = new Set<number>();
        if (!gs || !isMyTurn) return s;
        const territories = gs.territories;

        const deploying = gs.phase === 'setup' || gs.phase === 'reinforce'
            || (gs.phase === 'attack' && gs.reinforcementsRemaining > 0);
        if (deploying) {
            territories.forEach((t, id) => { if (t.owner === myUserId) s.add(id); });
            return s;
        }

        if (gs.phase === 'attack' && !gs.pendingOccupation) {
            if (selFrom === null) {
                territories.forEach((t, id) => { if (t.owner === myUserId && t.armies >= 2) s.add(id); });
            } else if (selTo === null) {
                ADJACENCY[selFrom].forEach(id => {
                    const t = territories[id];
                    if (t.owner && t.owner !== myUserId) s.add(id);
                });
            }
            return s;
        }

        if (gs.phase === 'fortify' && !gs.fortifyUsed) {
            if (selFrom === null) {
                territories.forEach((t, id) => { if (t.owner === myUserId && t.armies >= 2) s.add(id); });
            } else if (selTo === null) {
                territories.forEach((t, id) => {
                    if (id !== selFrom && t.owner === myUserId
                        && connectedThroughOwnedTerritories(selFrom, id, myUserId, territories)) {
                        s.add(id);
                    }
                });
            }
        }
        return s;
    }, [gs, isMyTurn, selFrom, selTo, myUserId]);

    function handleTerritoryClick(id: number) {
        if (!gs || !isMyTurn) return;
        const t = gs.territories[id];

        const deploying = gs.phase === 'setup' || gs.phase === 'reinforce'
            || (gs.phase === 'attack' && gs.reinforcementsRemaining > 0);
        if (deploying) {
            if (t.owner === myUserId) setSelFrom(id);
            return;
        }

        if (gs.phase === 'attack') {
            if (gs.pendingOccupation) return;
            if (selFrom === null) {
                if (t.owner === myUserId && t.armies >= 2) setSelFrom(id);
            } else if (selTo === null) {
                if (t.owner !== myUserId && isAdjacent(selFrom, id)) setSelTo(id);
            } else if (t.owner === myUserId && t.armies >= 2) {
                setSelFrom(id);
                setSelTo(null);
            }
            return;
        }

        if (gs.phase === 'fortify') {
            if (gs.fortifyUsed) return;
            if (selFrom === null) {
                if (t.owner === myUserId && t.armies >= 2) setSelFrom(id);
            } else if (selTo === null) {
                if (t.owner === myUserId && id !== selFrom
                    && connectedThroughOwnedTerritories(selFrom, id, myUserId, gs.territories)) {
                    setSelTo(id);
                }
            } else if (t.owner === myUserId && t.armies >= 2) {
                setSelFrom(id);
                setSelTo(null);
            }
        }
    }

    const displayedWinner = nav.displayedWinner;
    const displayedCurrentTurn = nav.displayedCurrentTurn;

    const playerName = (userId?: string): string => nameForUserId(gameData, userId);
    const getWinnerDisplayName = (): string => playerName(displayedWinner);
    const getForfeitedByDisplayName = (): string => playerName(gameData?.forfeitedBy);

    const currentTurnUsername = playerName(displayedCurrentTurn);

    const currentUserWon = complete && user?.id !== undefined && user.id === displayedWinner;
    const abandoned = abandonedGameStatus(complete, gameData?.endReason, getForfeitedByDisplayName());

    // ── Top-bar status line ──────────────────────────────────────────────────
    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete) {
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
        ? userIdList.flatMap((userId, i): ScoreEntry[] => {
            const ps = gs.playerStates?.[userId];
            if (!ps) return [];
            const isMe = userId === myUserId;
            const isActive = userId === displayedCurrentTurn && !complete;
            let sub: React.ReactNode;
            if (ps.eliminated) sub = '💀 out';
            else if (isActive) sub = PHASE_LABEL[gs.phase];
            else sub = `🃏 ${ps.cardCount}`;
            return [{
                id: userId,
                name: isMe ? 'You' : ps.username,
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

    // The same sheet either way: on your turn the phase controls, off it the
    // cards in your hand to plan the next one against (readOnly drops the
    // controls, ReadOnlyPanel takes what is left out of play).
    // A hand is the only thing the sheet has to show off-turn, so an empty one
    // means there is nothing to wait over.
    const waiting = nav.isLive && !isMyTurn && !complete && (gs?.playerStates?.[myUserId]?.cardCount ?? 0) > 0;
    const turnSheet = gs && !complete && (
        <WorldDominationActions
            gs={gs}
            myUserId={myUserId}
            selFrom={selFrom}
            selTo={selTo}
            setSelFrom={setSelFrom}
            setSelTo={setSelTo}
            submitCommand={submitCommand}
            pendingTarget={pendingTarget}
            readOnly={!isMyTurn}
        />
    );

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
    if (recap.show) {
        return (
            <TurnRecapScreen
                recap={recap.recap!}
                cta="Take your turn →"
                onDismiss={recap.dismiss}
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
                    message={abandoned
                        ? abandoned.message
                        : currentUserWon ? 'You won! 🎉' : `${getWinnerDisplayName()} achieved world domination.`}
                    gameId={gameId}
                    gameUrl="worlddomination"
                    usernameList={usernameList}
                    userIdList={userIdList}
                    myUserId={myUserId}
                    turnTimer={gameData?.turnTimer}
                />
            )}

            {gs && (
                <>
                    <div className="ag-board-area">
                        <WorldDominationBoard
                            territories={gs.territories}
                            colorForOwner={colorForOwner}
                            nameForOwner={playerName}
                            onTerritoryClick={isMyTurn && !complete && !submitting ? handleTerritoryClick : undefined}
                            validTerritories={validTerritories}
                            selectedTerritoryId={selFrom}
                            frontLine={gs.lastBattle ? { fromTerritoryId: gs.lastBattle.fromTerritoryId, toTerritoryId: gs.lastBattle.toTerritoryId } : null}
                            placementPrompt={placementPrompt}
                        />
                    </div>

                    {isMyTurn ? turnSheet
                        : waiting ? <ReadOnlyPanel waitingFor={currentTurnUsername}>{turnSheet}</ReadOnlyPanel>
                        : null}

                    <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} userIdList={userIdList} />

                    {showLog && (
                        <MatchHistory entries={nav.displayedHistory} userIdList={userIdList} oldestFirst />
                    )}
                </>
            )}
        </GameShell>
    );
}
