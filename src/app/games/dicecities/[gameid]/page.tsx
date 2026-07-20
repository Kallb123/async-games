'use client'
import { use } from "react";
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IDiceCitiesGameDataResponse, IDiceCitiesGameStateResponse, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import GameShell from "@/components/ui/GameShell";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import DiceCitiesBoard from "@/components/games/DiceCities/DiceCitiesBoard";
import DiceCitiesActions from "@/components/games/DiceCities/DiceCitiesActions";
import TurnNavControls from "@/components/games/TurnNavControls";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { landmarkCount } from "@/utils/ui/diceCities";

const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

// Sentinel used as "current turn" while reviewing a past turn, so no player's
// interactive controls activate.
const NO_ACTIVE_TURN = "__recap__";
const noopSubmit = async () => {};

export default function GameDiceCities({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const [gameData, setGameData] = useState({} as IDiceCitiesGameDataResponse);
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
            console.log(`DiceCitiesPage message received: TurnTaken`);
            getGameData();
        };
        window.addEventListener('TurnTaken', handleTurnTaken);
        return () => window.removeEventListener('TurnTaken', handleTurnTaken);
    }, [isLoaded]);

    const getGameData = async () => {
        fetch(`/api/game/${gameId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error("Game not found");
                }
                return response.json();
            })
            .then(data => {
                if (data) {
                    setGameData(data.gameData);
                }
            })
            .catch(error => {
                console.error(error);
                router.push('/');
            });
    };

    const submitCommand = async (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => {
        command.gameId = gameId;
        if (!user) {
            console.error("Unable to send command whilst not logged in");
            return;
        }
        command.senderId = user.id;
        command.senderUsername = user.username || user.firstName || user.id;
        fetch('/api/game/command', {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(command)
        })
            .then(response => (response.ok ? response.json() : undefined))
            .then(data => {
                console.log(data);
                const response = data as ICommandResponse | undefined;
                if (response?.gameData) {
                    setGameData(response.gameData as IDiceCitiesGameDataResponse);
                }
                // Always resolve so the caller can clear any pending/busy state,
                // even when the move was rejected (the route 401s with no body).
                callback(response ?? ({} as ICommandResponse));
            })
            .catch(() => callback({} as ICommandResponse));
    };

    const live = {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    };
    const nav = useTurnNavigation<IDiceCitiesGameStateResponse>(gameId, live);
    const displayed = nav.displayedState;
    const complete = nav.displayedComplete;
    const displayedCurrentTurn = nav.displayedCurrentTurn;
    const displayedWinner = nav.displayedWinner;

    // While reviewing a past turn, disable all interactive controls.
    const controlsCurrentTurn = nav.isLive ? displayedCurrentTurn : NO_ACTIVE_TURN;
    const controlsSubmit = nav.isLive ? submitCommand : noopSubmit;

    const usernameList = gameData?.usernameList ?? [];
    const players: IDiceCitiesPlayerStateResponse[] = displayed?.playerStates ? Object.values(displayed.playerStates) : [];
    const colorForUserId = (userId: string): string => {
        const ps = players.find(p => p.userId === userId);
        const idx = ps ? usernameList.indexOf(ps.username) : -1;
        return PLAYER_COLORS[(idx >= 0 ? idx : 0) % PLAYER_COLORS.length];
    };

    const myState = players.find(p => p.userId === user?.id);
    const boardPlayer = myState ?? players.find(p => p.userId === displayedCurrentTurn) ?? players[0];
    const opponents = boardPlayer ? players.filter(p => p.userId !== boardPlayer.userId) : [];
    const isMyTurn = nav.isLive && !!user?.id && user.id === displayedCurrentTurn && !complete;

    const leaderLandmarks = players.reduce((m, p) => Math.max(m, landmarkCount(p)), 0);
    const getWinnerDisplayName = (): string =>
        players.find(p => p.userId === displayedWinner)?.username ?? displayedWinner ?? "";
    const currentTurnUsername = players.find(p => p.userId === displayedCurrentTurn)?.username ?? "";
    const currentUserWon = complete && user?.id !== undefined && user.id === displayedWinner;
    const hasRolled = displayed?.hasRolled ?? false;

    // ── Top-bar status line ──────────────────────────────────────────────────
    let subtitle: React.ReactNode = 'Loading…';
    if (displayed) {
        if (complete) {
            subtitle = currentUserWon ? '🏆 You won!' : `${getWinnerDisplayName()} won`;
        } else if (isMyTurn) {
            subtitle = hasRolled
                ? <><span className="ag-hi">Your turn</span> · build or end turn</>
                : <><span className="ag-hi">Your roll</span> · build all 4 landmarks to win</>;
        } else {
            subtitle = <>{currentTurnUsername}&apos;s turn</>;
        }
    }

    // ── Scoreboard: landmark progress + coin bank per player ─────────────────
    const scoreEntries: ScoreEntry[] = displayed
        ? usernameList.flatMap((username, i): ScoreEntry[] => {
            const ps = displayed.playerStates?.[username];
            if (!ps) return [];
            const isMe = ps.userId === user?.id;
            const isActive = ps.userId === displayedCurrentTurn && !complete;
            const lm = landmarkCount(ps);
            const isLeader = lm === leaderLandmarks && lm > 0;
            return [{
                id: username,
                name: isMe ? 'You' : username,
                color: PLAYER_COLORS[i % PLAYER_COLORS.length],
                sub: <>{isLeader ? '👑' : '★'} {lm}/4</>,
                score: `${ps.money}🪙`,
                isMe,
                isActive,
            }];
        })
        : [];

    const logButton = displayed ? (
        <button
            className={`ag-game-topbar-btn${showLog ? ' ag-game-topbar-btn--on' : ''}`}
            onClick={() => setShowLog(v => !v)}
            aria-label="Game log"
        >📜</button>
    ) : undefined;

    return (
        <GameShell title="Dice Cities" subtitle={subtitle} right={logButton}>
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} />

            {complete && (
                <div className="ag-game-result">
                    <h2>{currentUserWon ? 'You won! 🎉' : `${getWinnerDisplayName()} won! Better luck next time.`}</h2>
                </div>
            )}

            {boardPlayer && (
                <DiceCitiesBoard
                    playerState={boardPlayer}
                    ownerLabel={boardPlayer.userId === user?.id ? 'Your city' : `${boardPlayer.username}'s city`}
                />
            )}

            {isMyTurn && boardPlayer && controlsCurrentTurn === boardPlayer.userId && (
                <DiceCitiesActions
                    gameState={displayed!}
                    myState={boardPlayer}
                    opponents={opponents}
                    submitCommand={controlsSubmit}
                />
            )}

            {showLog && (
                <div className="ag-log">
                    <ul className="ag-log-list">
                        {nav.displayedHistory.map((h, i) => (
                            <li key={i} className="ag-log-item">{h}</li>
                        ))}
                        {nav.displayedHistory.length === 0 && (
                            <li className="ag-log-item">No moves yet.</li>
                        )}
                    </ul>
                </div>
            )}
        </GameShell>
    );
}
