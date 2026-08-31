'use client'
import { use } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ISmartthinkGameDataResponse } from "@/games/Smartthink/apiModels";
import GameShell from "@/components/ui/GameShell";
import { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import SmartthinkBoard from "@/games/Smartthink/components/SmartthinkBoard";
import SmartthinkPlayerActions from "@/games/Smartthink/components/SmartthinkPlayerActions";
import TurnNavControls from "@/components/games/TurnNavControls";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import type { ISmartthinkGameStateResponse } from "@/games/Smartthink/apiModels";
import { SMARTTHINK_CODE_LENGTH } from "@/games/Smartthink/ui";
import { abandonedGameStatus } from "@/utils/ui/players";

const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];
const emptyGuess = (): (number | null)[] => Array(SMARTTHINK_CODE_LENGTH).fill(null);

export default function GameSmartthink({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();
    const [currentGuess, setCurrentGuess] = useState<(number | null)[]>(emptyGuess());

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<ISmartthinkGameDataResponse>(gameId);

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

    const playerName = (userId?: string): string => {
        if (!userId) return "";
        if (!state) return userId;
        if (userId === state.codeSetterId) return state.codeSetterUsername || userId;
        if (userId === state.codeBreakerId) return state.codeBreakerUsername || userId;
        return state.players?.find(p => p.userId === userId)?.username ?? userId;
    };
    const getWinnerDisplayName = (): string => playerName(gameData?.winner);
    const getForfeitedByDisplayName = (): string => playerName(gameData?.forfeitedBy);
    const currentUserWon = complete && user?.id !== undefined && user.id === nav.displayedWinner;
    const abandoned = abandonedGameStatus(complete, gameData?.endReason, getForfeitedByDisplayName());
    const myUserId = user?.id ?? '';
    const usernameList = gameData?.usernameList ?? [];
    const userIdList = gameData?.userIdList ?? [];

    // ── Top-bar status line ──────────────────────────────────────────────────
    let subtitle: React.ReactNode = 'Loading…';
    if (displayed) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete) {
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
            return {
                id: p.userId,
                name: isMe ? 'You' : p.username,
                color: PLAYER_COLORS[i % PLAYER_COLORS.length],
                sub: isSetter ? '🔒 setter' : '🔓 breaker',
                score: isSetter ? '🔒' : displayed.guessRows.length,
                isMe,
                isActive,
            };
        })
        : [];

    const showCurrentRow = isMyTurn && isCodeBreaker && (displayed?.secretCodeSet ?? false);

    const menuOptions: GameOption[] = [
        ...(!complete ? [{
            key: 'end',
            label: 'End game',
            icon: '🏳️',
            danger: true,
            onClick: endGame,
        }] : []),
    ];

    return (
        <GameShell title="Smartthink" subtitle={subtitle} options={displayed ? menuOptions : undefined} syncing={submitting} log={{ entries: nav.displayedHistory, userIdList, oldestFirst: true }} chat={{ gameId, userIdList, usernameList }}>
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {complete && (
                <GameFinishBanner
                    message={abandoned
                        ? abandoned.message
                        : currentUserWon ? 'You cracked it! 🎉' : `${getWinnerDisplayName()} won! Better luck next time.`}
                    gameId={gameId}
                    gameUrl="smartthink"
                    usernameList={usernameList}
                    userIdList={userIdList}
                    myUserId={myUserId}
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

            <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} userIdList={userIdList} />
        </GameShell>
    );
}
