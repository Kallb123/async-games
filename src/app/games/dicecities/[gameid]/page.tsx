'use client'
import { use } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IDiceCitiesGameDataResponse, IDiceCitiesGameStateResponse, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import DiceCitiesBoard from "@/games/DiceCities/components/DiceCitiesBoard";
import DiceCitiesActions from "@/games/DiceCities/components/DiceCitiesActions";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecapScreen from "@/components/games/TurnRecapScreen";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { landmarkCount } from "@/games/DiceCities/ui";
import { PLAYER_COLOURS, playerColourForId } from "@/utils/ui/playerColours";
import { abandonedGameStatus } from "@/utils/ui/players";
import MatchHistory from "@/components/games/MatchHistory";

// Sentinel used as "current turn" while reviewing a past turn, so no player's
// interactive controls activate.
const NO_ACTIVE_TURN = "__recap__";
const noopSubmit = async () => {};

export default function GameDiceCities({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();
    const [showLog, setShowLog] = useState(false);

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<IDiceCitiesGameDataResponse>(gameId);

    const { submitCommand, submitting, pendingTarget } = useSubmitCommand<IDiceCitiesGameDataResponse>(gameId, user, setGameData, getGameData);

    const live = {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    };
    const nav = useTurnNavigation<IDiceCitiesGameStateResponse>(gameId, live);

    // "Since you were last here": on open, if turns elapsed since our last move,
    // show the recap intro before the board. Dismissing (or the CTA) reveals it.
    const recap = useTurnRecap(gameId);
    const { endGame } = useEndGame(gameId);

    const displayed = nav.displayedState;
    const complete = nav.displayedComplete;
    const displayedCurrentTurn = nav.displayedCurrentTurn;
    const displayedWinner = nav.displayedWinner;

    // While reviewing a past turn, disable all interactive controls.
    const controlsCurrentTurn = nav.isLive ? displayedCurrentTurn : NO_ACTIVE_TURN;
    const controlsSubmit = nav.isLive ? submitCommand : noopSubmit;
    const controlsPendingTarget = nav.isLive ? pendingTarget : null;

    const usernameList = gameData?.usernameList ?? [];
    const userIdList = gameData?.userIdList ?? [];
    const myUserId = user?.id ?? "";
    const players: IDiceCitiesPlayerStateResponse[] = displayed?.playerStates ? Object.values(displayed.playerStates) : [];
    const colorForUserId = (userId: string): string => playerColourForId(userId, userIdList);

    const myState = players.find(p => p.userId === user?.id);
    const boardPlayer = myState ?? players.find(p => p.userId === displayedCurrentTurn) ?? players[0];
    const opponents = boardPlayer ? players.filter(p => p.userId !== boardPlayer.userId) : [];
    const isMyTurn = nav.isLive && !!user?.id && user.id === displayedCurrentTurn && !complete;

    const leaderLandmarks = players.reduce((m, p) => Math.max(m, landmarkCount(p)), 0);
    const playerName = (userId?: string): string =>
        players.find(p => p.userId === userId)?.username ?? userId ?? "";
    const getWinnerDisplayName = (): string => playerName(displayedWinner);
    const getForfeitedByDisplayName = (): string => playerName(gameData?.forfeitedBy);
    const currentTurnUsername = players.find(p => p.userId === displayedCurrentTurn)?.username ?? "";
    const currentUserWon = complete && user?.id !== undefined && user.id === displayedWinner;
    const abandoned = abandonedGameStatus(complete, gameData?.endReason, getForfeitedByDisplayName());
    const hasRolled = displayed?.hasRolled ?? false;

    // ── Top-bar status line ──────────────────────────────────────────────────
    let subtitle: React.ReactNode = 'Loading…';
    if (displayed) {
        if (abandoned) {
            subtitle = abandoned.subtitle;
        } else if (complete) {
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
        ? userIdList.flatMap((userId, i): ScoreEntry[] => {
            const ps = displayed.playerStates?.[userId];
            if (!ps) return [];
            const isMe = ps.userId === user?.id;
            const isActive = ps.userId === displayedCurrentTurn && !complete;
            const lm = landmarkCount(ps);
            const isLeader = lm === leaderLandmarks && lm > 0;
            return [{
                id: userId,
                name: isMe ? 'You' : ps.username,
                color: PLAYER_COLOURS[i % PLAYER_COLOURS.length],
                sub: <>{isLeader ? '👑' : '★'} {lm}/4</>,
                score: `${ps.money}🪙`,
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
    const optionsMenu = displayed ? <GameOptionsMenu options={menuOptions} /> : undefined;

    // Recap intro: a standalone welcome-back screen shown before the board when
    // it's our turn and moves happened while we were away.
    if (recap.show) {
        return (
            <TurnRecapScreen
                recap={recap.recap!}
                cta="Roll the dice →"
                onDismiss={recap.dismiss}
                onReact={recap.react}
            />
        );
    }

    return (
        <GameShell title="Dice Cities" subtitle={subtitle} right={optionsMenu} syncing={submitting}>
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {complete && (
                <GameFinishBanner
                    message={abandoned
                        ? abandoned.message
                        : currentUserWon ? 'You won! 🎉' : `${getWinnerDisplayName()} won! Better luck next time.`}
                    gameId={gameId}
                    gameUrl="dicecities"
                    usernameList={usernameList}
                    userIdList={userIdList}
                    myUserId={myUserId}
                    turnTimer={gameData?.turnTimer}
                />
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
                    pendingTarget={controlsPendingTarget}
                />
            )}

            <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} usernames={usernameList} />

            {showLog && (
                <MatchHistory entries={nav.displayedHistory} usernames={usernameList} />
            )}
        </GameShell>
    );
}
