'use client'
import { use } from "react";
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import type { ISmartthinkGameDataResponse } from "@/games/Smartthink/apiModels";
import GameShell from "@/components/ui/GameShell";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import SmartthinkBoard from "@/games/Smartthink/components/SmartthinkBoard";
import SmartthinkPlayerActions from "@/games/Smartthink/components/SmartthinkPlayerActions";
import TurnNavControls from "@/components/games/TurnNavControls";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { usePushEvents, TURN_ADVANCED_EVENTS } from "@/utils/hooks/usePushEvents";
import type { ISmartthinkGameStateResponse } from "@/games/Smartthink/apiModels";
import { SMARTTHINK_CODE_LENGTH } from "@/games/Smartthink/ui";

const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];
const emptyGuess = (): (number | null)[] => Array(SMARTTHINK_CODE_LENGTH).fill(null);

export default function GameSmartthink({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const [gameData, setGameData] = useState({} as ISmartthinkGameDataResponse);
    const [currentGuess, setCurrentGuess] = useState<(number | null)[]>(emptyGuess());
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
    }, [isLoaded]);

    usePushEvents(TURN_ADVANCED_EVENTS, () => getGameData(), { refreshOnVisible: true });

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
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(command)
        })
            .then(response => {
                if (response.ok) {
                    return response.json();
                }
            })
            .then(data => {
                console.log(data);
                const response: ICommandResponse = data;
                if (!response || !response.gameData) {
                    return;
                }
                setGameData(response.gameData as ISmartthinkGameDataResponse);
                callback(data);
            });
    };

    const isCodeSetter = user?.id === gameData?.specificGameState?.codeSetterId;
    const isCodeBreaker = user?.id === gameData?.specificGameState?.codeBreakerId;

    const live = {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    };
    const nav = useTurnNavigation<ISmartthinkGameStateResponse>(gameId, live);
    const displayed = nav.displayedState;
    const complete = nav.displayedComplete;
    const isMyTurn = nav.isLive && user?.id === gameData?.currentTurn && !complete;

    const state = gameData?.specificGameState;

    const getWinnerDisplayName = (): string => {
        if (!state) return gameData?.winner ?? "";
        if (gameData.winner === state.codeSetterId) return state.codeSetterUsername || gameData.winner;
        if (gameData.winner === state.codeBreakerId) return state.codeBreakerUsername || gameData.winner;
        return state.players?.find(p => p.userId === gameData.winner)?.username ?? gameData?.winner ?? "";
    };
    const currentUserWon = complete && user?.id !== undefined && user.id === nav.displayedWinner;

    // ── Top-bar status line ──────────────────────────────────────────────────
    let subtitle: React.ReactNode = 'Loading…';
    if (displayed) {
        if (complete) {
            subtitle = currentUserWon ? '🏆 You cracked it!' : `${getWinnerDisplayName()} won`;
        } else if (!displayed.secretCodeSet) {
            subtitle = isCodeSetter
                ? <><span className="ag-hi">Your move</span> · hide a code for {displayed.codeBreakerUsername}</>
                : <>Waiting for {displayed.codeSetterUsername} to set a code</>;
        } else if (isMyTurn && isCodeBreaker) {
            subtitle = <><span className="ag-hi">Your move</span> · crack {displayed.codeSetterUsername}&apos;s code</>;
        } else {
            subtitle = <>Waiting on {displayed.codeBreakerUsername}&apos;s guess</>;
        }
    }

    // ── Scoreboard: setter/breaker roles + guesses made ──────────────────────
    const scoreEntries: ScoreEntry[] = displayed
        ? (displayed.players ?? []).map((p, i): ScoreEntry => {
            const isMe = p.userId === user?.id;
            const isSetter = p.userId === displayed.codeSetterId;
            const isActive = p.userId === nav.displayedCurrentTurn && !complete;
            let sub: React.ReactNode;
            if (isActive) sub = '▶ now';
            else if (isSetter) sub = '🔒 setter';
            else sub = '🔓 breaker';
            return {
                id: p.userId,
                name: isMe ? 'You' : p.username,
                color: PLAYER_COLORS[i % PLAYER_COLORS.length],
                sub,
                score: isSetter ? '🔒' : displayed.guessRows.length,
                isMe,
                isActive,
            };
        })
        : [];

    const showCurrentRow = isMyTurn && isCodeBreaker && (displayed?.secretCodeSet ?? false);

    const logButton = displayed ? (
        <button
            className={`ag-game-topbar-btn${showLog ? ' ag-game-topbar-btn--on' : ''}`}
            onClick={() => setShowLog(v => !v)}
            aria-label="Game log"
        >📜</button>
    ) : undefined;

    return (
        <GameShell title="Smartthink" subtitle={subtitle} right={logButton}>
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} />

            {complete && (
                <div className="ag-game-result">
                    <h2>{currentUserWon ? 'You cracked it! 🎉' : `${getWinnerDisplayName()} won! Better luck next time.`}</h2>
                </div>
            )}

            {displayed && (
                <SmartthinkBoard
                    guessRows={displayed.guessRows}
                    maxGuesses={displayed.maxGuesses}
                    currentGuess={currentGuess}
                    showCurrentRow={showCurrentRow}
                />
            )}

            {isMyTurn && state && (
                <SmartthinkPlayerActions
                    gameState={state}
                    isCodeSetter={isCodeSetter}
                    isCodeBreaker={isCodeBreaker}
                    currentGuess={currentGuess}
                    setCurrentGuess={setCurrentGuess}
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
        </GameShell>
    );
}
