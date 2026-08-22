'use client'
import { use, useMemo, useState } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ITrainTimeGameDataResponse } from "@/games/TrainTime/apiModels";
import {
    ClaimContext,
    ROUTES,
    TRAINS_PER_PLAYER,
    TrainTimeCardColour,
    claimableRouteIds,
    routeName,
} from "@/games/TrainTime/board";
import TrainTimeBoard from "@/games/TrainTime/components/TrainTimeBoard";
import TrainTimeActions, { TrainTimeAction } from "@/games/TrainTime/components/TrainTimeActions";
import TrainTimeClaimSheet from "@/games/TrainTime/components/TrainTimeClaimSheet";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import Stat from "@/components/ui/Stat";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { useResettingState } from "@/utils/hooks/useResettingState";
import { TrainTimeClaimRoute } from "@/utils/apiModels/GameLogic";
import { TRACK_PALETTE } from "@/games/TrainTime/ui";
import { playerColour } from "@/utils/ui/playerColours";
import { pluralize } from "@/utils/ui/text";
import { abandonedGameStatus, currentUsername } from "@/utils/ui/players";

// Trains at or below this leave a player one big route from ending the game —
// the standings ring them so everybody can see the clock running down.
const LOW_TRAINS = 6;

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
    const me = gs?.playerStates[myUsername];

    // Everything the player picked for this turn resets when the turn moves on
    // or a route goes off the board under them.
    const turnKey = `${gameData?.currentTurn}:${gs?.routeOwners.filter(Boolean).length}`;
    const [selectedRouteId, setSelectedRouteId] = useResettingState<number | null>(null, turnKey);
    const [action, setAction] = useResettingState<TrainTimeAction>('draw', turnKey);
    const [claiming, setClaiming] = useResettingState(false, `${turnKey}:${selectedRouteId}`);

    // One claim context for the screen — the board highlights from it and the
    // claim sheet prices against it.
    const claimContext: ClaimContext | null = useMemo(() => {
        if (!gs || !me) return null;
        return { routeOwners: gs.routeOwners, playerCount, hand: gs.myHand, trains: me.trains, playerId: myUsername };
    }, [gs, me, myUsername, playerCount]);

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

    const claimRoute = (payment: TrainTimeCardColour[]) => {
        if (selectedRouteId === null) return;
        const command = new TrainTimeClaimRoute();
        command.routeId = selectedRouteId;
        command.cards = payment;
        submitCommand(command, () => setSelectedRouteId(null), 'claim');
    };

    function selectRoute(routeId: number) {
        setSelectedRouteId(routeId);
        setAction('claim');
    }

    // ── Top-bar status line ──────────────────────────────────────────────────
    const claimSheetRoute = claiming && selectedRouteId !== null ? ROUTES[selectedRouteId] : null;
    let subtitle: React.ReactNode = 'Loading…';
    if (gs) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete) {
            subtitle = sharedWin ? '🤝 Shared win' : currentUserWon ? '🏆 You won!' : `${playerName(gameData?.winner)} won`;
        } else if (claimSheetRoute) {
            subtitle = `Claim route · ${routeName(claimSheetRoute)}`;
        } else {
            const lastLap = gs.finalRoundPending ? ' · last lap' : '';
            subtitle = isMyTurn
                ? <>Your move · <span className="ag-hi">one action</span>{lastLap}</>
                : <>{currentTurnUsername}&apos;s move{lastLap}</>;
        }
    }

    // ── Standings ────────────────────────────────────────────────────────────
    const scoreEntries: ScoreEntry[] = gs
        ? usernameList.flatMap((username, i): ScoreEntry[] => {
            const ps = gs.playerStates[username];
            if (!ps) return [];
            const isMe = username === myUsername;
            const isActive = username === currentTurnUsername && !complete;
            return [{
                id: username,
                name: isMe ? 'You' : username,
                color: playerColour(i),
                sub: isActive ? `▶ now · ${ps.trains} trains` : `${ps.trains} tr. · 🃏 ${ps.handCount}`,
                score: ps.score,
                isMe,
                isActive,
                warn: ps.trains <= LOW_TRAINS && !complete,
            }];
        })
        : [];

    const menuOptions: GameOption[] = !complete ? [{
        key: 'end',
        label: 'End game',
        icon: '🏳️',
        danger: true,
        onClick: endGame,
    }] : [];

    let boardTag: string | null = null;
    if (gs && isMyTurn && !complete) {
        if (gs.drawsThisTurn > 0) boardTag = '🃏 one more card to take';
        else if (claimableRoutes.size > 0) boardTag = `◆ ${pluralize(claimableRoutes.size, 'route')} claimable`;
        else boardTag = '◆ nothing claimable — draw cards';
    }

    return (
        <GameShell
            title="Train Time"
            subtitle={subtitle}
            right={claimSheetRoute
                ? <button type="button" className="ag-game-topbar-btn" aria-label="Close" onClick={() => setClaiming(false)}>✕</button>
                : gs && menuOptions.length > 0 ? <GameOptionsMenu options={menuOptions} /> : undefined}
            syncing={submitting}
            className="ag-game--traintime"
        >
            <FcmTokenComp />

            {/* The claim sheet is a screen of its own (design 14b): its dark
                route header runs straight off the top bar, with the standings
                out of the way until the player comes back to the map. */}
            {!claimSheetRoute && scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {gs && me && !claimSheetRoute && (
                <div className="ag-stat-row">
                    <Stat
                        value={<>{me.trains}<span className="ag-tt-stat-suffix">of {TRAINS_PER_PLAYER}</span></>}
                        label="Trains"
                    />
                    <Stat value={me.routesClaimed} label="Routes" />
                    <Stat
                        value={<>{gs.deckCount}<span className="ag-tt-stat-suffix">+{gs.discardCount} used</span></>}
                        label="Deck"
                    />
                </div>
            )}

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

            {gs && claimSheetRoute && me ? (
                <TrainTimeClaimSheet
                    route={claimSheetRoute}
                    hand={gs.myHand}
                    me={me}
                    onClaim={claimRoute}
                    onBack={() => setClaiming(false)}
                    pending={pendingTarget === 'claim'}
                />
            ) : gs && (
                <>
                    <div className="ag-board-area">
                        <TrainTimeBoard
                            routeOwners={gs.routeOwners}
                            usernameToColour={(username) => playerColour(usernameList.indexOf(username))}
                            claimableRoutes={claimableRoutes}
                            highlightClaimable={action === 'claim'}
                            selectedRouteId={selectedRouteId}
                            onRouteClick={isMyTurn && !submitting ? selectRoute : undefined}
                            boardTag={boardTag}
                        />
                        <div className="ag-tt-legend">
                            {usernameList.map((username, i) => (
                                <span key={username} className="ag-tt-legend-item">
                                    <span className="ag-tt-legend-rail" style={{ background: playerColour(i) }} />
                                    {username === myUsername ? 'You' : username} {gs.playerStates[username]?.routesClaimed ?? 0}
                                </span>
                            ))}
                            <span className="ag-tt-legend-item">
                                <span className="ag-tt-legend-rail" style={{ background: TRACK_PALETTE.grey.fill }} />
                                open {gs.routeOwners.filter(o => o === null).length}
                            </span>
                        </div>
                    </div>

                    {isMyTurn && (
                        <TrainTimeActions
                            gs={gs}
                            myUsername={myUsername}
                            action={action}
                            setAction={setAction}
                            selectedRouteId={selectedRouteId}
                            onClaim={() => setClaiming(true)}
                            claimableCount={claimableRoutes.size}
                            showLog={showLog}
                            onToggleLog={() => setShowLog(v => !v)}
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
