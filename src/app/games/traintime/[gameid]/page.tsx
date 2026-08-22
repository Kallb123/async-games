'use client'
import { use, useMemo, useState } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ITrainTimeGameDataResponse } from "@/games/TrainTime/apiModels";
import { ClaimContext, ROUTES, claimableRouteIds, routeName } from "@/games/TrainTime/board";
import TrainTimeBoard from "@/games/TrainTime/components/TrainTimeBoard";
import TrainTimeActions from "@/games/TrainTime/components/TrainTimeActions";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { playerColour } from "@/utils/ui/playerColours";
import { abandonedGameStatus, currentUsername } from "@/utils/ui/players";

export default function GameTrainTime({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();
    const [showLog, setShowLog] = useState(false);

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<ITrainTimeGameDataResponse>(gameId);
    const { submitCommand, submitting, pendingTarget } = useSubmitCommand<ITrainTimeGameDataResponse>(gameId, user, setGameData, getGameData);
    const { endGame } = useEndGame(gameId);

    const gs = gameData?.specificGameState;
    const complete = gameData?.complete ?? false;
    const isMyTurn = user?.id === gameData?.currentTurn && !complete;
    const myUsername = currentUsername(user);
    const usernameList = useMemo(() => gameData?.usernameList ?? [], [gameData?.usernameList]);
    const playerCount = usernameList.length;

    // The board is only ever selectable on your own turn; a claim that lands
    // while you were choosing clears the selection.
    const [selectedRouteId, setSelectedRouteId] = useResettingState<number | null>(
        null,
        `${gameData?.currentTurn}:${gs?.routeOwners.filter(Boolean).length}`,
    );

    const usernameToColour = (username: string) => playerColour(usernameList.indexOf(username));

    // One claim context for the screen — the board highlights from it and the
    // actions sheet explains a blocked route with it.
    const claimContext: ClaimContext | null = useMemo(() => {
        const me = gs?.playerStates[myUsername];
        if (!gs || !me) return null;
        return { routeOwners: gs.routeOwners, playerCount, hand: gs.myHand, trains: me.trains, playerId: myUsername };
    }, [gs, myUsername, playerCount]);

    // A draw already started this turn is one action, so nothing is claimable
    // until it finishes.
    const claimableRoutes = useMemo(
        () => (claimContext && isMyTurn && gs?.drawsThisTurn === 0 ? claimableRouteIds(claimContext) : new Set<number>()),
        [claimContext, isMyTurn, gs?.drawsThisTurn],
    );

    const playerName = (userId?: string): string => {
        if (!userId || !gs) return userId ?? '';
        return Object.values(gs.playerStates).find(p => p.userId === userId)?.username ?? userId;
    };
    const currentTurnUsername = playerName(gameData?.currentTurn);
    const currentUserWon = complete && !!user?.id && user.id === gameData?.winner;
    const sharedWin = complete && gameData?.winner === '';
    const abandoned = abandonedGameStatus(complete, gameData?.endReason, playerName(gameData?.forfeitedBy));

    // ── Top-bar status line ──────────────────────────────────────────────────
    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete) {
            subtitle = sharedWin ? '🤝 Shared win' : currentUserWon ? '🏆 You won!' : `${playerName(gameData?.winner)} won`;
        } else {
            const lastLap = gs.finalRoundPending ? ' · last lap' : '';
            subtitle = isMyTurn
                ? <><span className="ag-hi">Your move</span>{lastLap}</>
                : <>{currentTurnUsername}&apos;s move{lastLap}</>;
        }
    }

    // ── Scoreboard ───────────────────────────────────────────────────────────
    const scoreEntries: ScoreEntry[] = gs
        ? usernameList.flatMap((username, i): ScoreEntry[] => {
            const ps = gs.playerStates[username];
            if (!ps) return [];
            const isActive = username === currentTurnUsername && !complete;
            return [{
                id: username,
                name: username === myUsername ? 'You' : username,
                color: playerColour(i),
                sub: isActive ? '▶ now' : `🃏 ${ps.handCount} · 🚂 ${ps.trains}`,
                score: ps.score,
                isMe: username === myUsername,
                isActive,
            }];
        })
        : [];

    const menuOptions: GameOption[] = [
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

    let boardTag: string | null = null;
    if (gs && isMyTurn && !complete) {
        if (gs.drawsThisTurn > 0) boardTag = '🃏 one more card to take';
        else if (selectedRouteId !== null) boardTag = `📍 ${routeName(ROUTES[selectedRouteId])}`;
        else boardTag = `🚂 ${claimableRoutes.size} routes you can claim`;
    }

    return (
        <GameShell title="Train Time" subtitle={subtitle} right={gs ? <GameOptionsMenu options={menuOptions} /> : undefined} syncing={submitting}>
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {complete && (
                <GameFinishBanner
                    message={abandoned
                        ? abandoned.message
                        : sharedWin ? 'A dead heat — the win is shared. 🤝'
                        : currentUserWon ? 'You won! 🎉' : `${playerName(gameData?.winner)} built the better network.`}
                    gameId={gameId}
                    gameUrl="traintime"
                    usernameList={usernameList}
                    myUsername={myUsername}
                    turnTimer={gameData?.turnTimer}
                />
            )}

            {gs && (
                <>
                    <div className="ag-board-area">
                        <TrainTimeBoard
                            routeOwners={gs.routeOwners}
                            usernameToColour={usernameToColour}
                            claimableRoutes={claimableRoutes}
                            selectedRouteId={selectedRouteId}
                            onRouteClick={isMyTurn && !submitting ? setSelectedRouteId : undefined}
                            boardTag={boardTag}
                        />
                    </div>

                    {isMyTurn && (
                        <TrainTimeActions
                            gs={gs}
                            myUsername={myUsername}
                            claimContext={claimContext}
                            selectedRouteId={selectedRouteId}
                            setSelectedRouteId={setSelectedRouteId}
                            submitCommand={submitCommand}
                            pendingTarget={pendingTarget}
                        />
                    )}

                    {showLog && (
                        <div className="ag-log">
                            <ul className="ag-log-list">
                                {gameData?.gameState?.history?.map((entry, i) => (
                                    <li key={i} className="ag-log-item">{entry}</li>
                                ))}
                                {!gameData?.gameState?.history?.length && (
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
