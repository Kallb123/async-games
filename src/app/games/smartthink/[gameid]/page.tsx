'use client'
import { use } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ISmartthinkGameDataResponse } from "@/games/Smartthink/apiModels";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import SmartthinkBoard from "@/games/Smartthink/components/SmartthinkBoard";
import SmartthinkPlayerActions from "@/games/Smartthink/components/SmartthinkPlayerActions";
import TurnNavControls from "@/components/games/TurnNavControls";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { usePushEvents, TURN_ADVANCED_EVENTS } from "@/utils/hooks/usePushEvents";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import type { ISmartthinkGameStateResponse } from "@/games/Smartthink/apiModels";
import { SMARTTHINK_CODE_LENGTH } from "@/games/Smartthink/ui";
import { currentUsername } from "@/utils/ui/players";

const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];
const emptyGuess = (): (number | null)[] => Array(SMARTTHINK_CODE_LENGTH).fill(null);

export default function GameSmartthink({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isAuthorised } = useAuthGuard();
    const [currentGuess, setCurrentGuess] = useState<(number | null)[]>(emptyGuess());
    const [showLog, setShowLog] = useState(false);

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<ISmartthinkGameDataResponse>(gameId);

    useEffect(() => {
        if (isAuthorised) {
            getGameData();
        }
    }, [isAuthorised]);

    usePushEvents(TURN_ADVANCED_EVENTS, () => getGameData(), { refreshOnVisible: true });

    const { submitCommand, submitting } = useSubmitCommand<ISmartthinkGameDataResponse>(gameId, user, setGameData, getGameData);

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
    const { endGame } = useEndGame(gameId);
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
    const myUsername = currentUsername(user);
    const usernameList = gameData?.usernameList ?? [];

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
    const optionsMenu = displayed ? <GameOptionsMenu options={menuOptions} /> : undefined;

    return (
        <GameShell title="Smartthink" subtitle={subtitle} right={optionsMenu} syncing={submitting}>
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {complete && (
                <GameFinishBanner
                    message={currentUserWon ? 'You cracked it! 🎉' : `${getWinnerDisplayName()} won! Better luck next time.`}
                    gameId={gameId}
                    gameUrl="smartthink"
                    usernameList={usernameList}
                    myUsername={myUsername}
                    turnTimer={gameData?.turnTimer}
                />
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
                    submitting={submitting}
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
        </GameShell>
    );
}
