'use client'
import { use, type CSSProperties } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { IDiceCitiesGameDataResponse, IDiceCitiesGameStateResponse, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import GameShell from "@/components/ui/GameShell";
import ReadOnlyPanel from "@/components/ui/ReadOnlyPanel";
import { GameOption } from "@/components/ui/GameOptionsMenu";
import GameGuideModal from "@/components/ui/GameGuideModal";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import DiceCitiesBoard from "@/games/DiceCities/components/DiceCitiesBoard";
import DiceCitiesLandmarkTrack from "@/games/DiceCities/components/DiceCitiesLandmarkTrack";
import DiceCitiesActions from "@/games/DiceCities/components/DiceCitiesActions";
import { buildDiceCitiesGuide } from "@/games/DiceCities/guide";
import { diceCitiesTheme } from "@/games/DiceCities/themes";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecapScreen from "@/components/games/TurnRecapScreen";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useHistoryReactions } from "@/utils/hooks/useHistoryReactions";
import { useGameGuide } from "@/utils/hooks/useGameGuide";
import { useSubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { LANDMARKS, landmarkCount } from "@/games/DiceCities/ui";
import { playerColourForId } from "@/utils/ui/playerColours";
import { abandonedGameStatus, isPlayersTurn, nameForUserId, reorderByIds, scoreboardSeatOrder } from "@/utils/ui/players";
import { rematchTheme } from "@/utils/ui/rematch";

// Sentinel used as "current turn" while reviewing a past turn, so no player's
// interactive controls activate.
const NO_ACTIVE_TURN = "__recap__";
const noopSubmit = async () => {};

export default function GameDiceCities({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<IDiceCitiesGameDataResponse>(gameId);
    const historyReact = useHistoryReactions(gameId, user?.id, setGameData, getGameData);

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

    // The "how to play" popup: shown automatically the first time this account
    // opens a Dice Cities match, and on demand from the game-options menu.
    const gameGuide = useGameGuide('dicecities');

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
    // Every city at the table, the viewer's seat first, then the real turn
    // order. One array feeds the landmark track, the city stack and the
    // scoreboard, so all three read the same seats in the same order.
    const seats: IDiceCitiesPlayerStateResponse[] = reorderByIds(
        Object.values(displayed?.playerStates ?? {}),
        scoreboardSeatOrder(gameData, myUserId),
        p => p.userId,
    );

    const myState = seats.find(p => p.userId === myUserId);
    // Anchored to the viewer, never to whichever city is on screen: these are
    // the players the TV Station and the Business Center may be pointed at.
    const opponents = seats.filter(p => p.userId !== myUserId);
    const isMyTurn = isPlayersTurn(nav.isLive, user, displayedCurrentTurn) && !complete;

    const leaderLandmarks = seats.reduce((m, p) => Math.max(m, landmarkCount(p)), 0);
    const playerName = (userId?: string): string => nameForUserId(gameData, userId);
    const getWinnerDisplayName = (): string => playerName(displayedWinner);
    const getForfeitedByDisplayName = (): string => playerName(gameData?.forfeitedBy);
    const currentTurnUsername = playerName(displayedCurrentTurn);
    const currentUserWon = complete && user?.id !== undefined && user.id === displayedWinner;
    const abandoned = abandonedGameStatus(complete, gameData?.endReason, getForfeitedByDisplayName());
    const hasRolled = displayed?.hasRolled ?? false;
    const enabledDocks = displayed?.enabledDocks === true;
    // Fixed at creation and carried on the game state, so a game reviewed turn
    // by turn stays in the theme it was played in. Total, so a game older than
    // themes reads back as the game it shipped as.
    const theme = diceCitiesTheme(displayed?.theme);

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
                : <><span className="ag-hi">Your roll</span> · build all {LANDMARKS.length} {theme.words.landmarks} to win</>;
        } else {
            subtitle = <>{currentTurnUsername}&apos;s turn</>;
        }
    }

    // ── Scoreboard: landmark progress + coin bank per player ─────────────────
    const scoreEntries: ScoreEntry[] = displayed
        ? seats.map((ps): ScoreEntry => {
            const isMe = ps.userId === myUserId;
            const isActive = ps.userId === displayedCurrentTurn && !complete;
            const lm = landmarkCount(ps);
            const isLeader = lm === leaderLandmarks && lm > 0;
            return {
                id: ps.userId,
                name: isMe ? 'You' : ps.username,
                color: playerColourForId(ps.userId, userIdList),
                sub: <>{isLeader ? '👑' : '★'} {lm}/{LANDMARKS.length}</>,
                score: `${ps.money}🪙`,
                isMe,
                isActive,
            };
        })
        : [];

    // The same sheet either way: on your turn the dice and the build step, off
    // it the market alone (readOnly), so the cards on offer and what they cost
    // can be read while you wait. It is the viewer's own row either way — a
    // spectator with no row of their own gets no sheet at all.
    const turnSheet = displayed && myState && (
        <DiceCitiesActions
            gameState={displayed}
            myState={myState}
            opponents={opponents}
            theme={theme}
            submitCommand={controlsSubmit}
            pendingTarget={controlsPendingTarget}
            readOnly={!isMyTurn}
        />
    );

    const menuOptions: GameOption[] = [
        ...(recap.hasRecap ? [{
            key: 'recap',
            label: 'Show last recap',
            icon: '🔁',
            onClick: recap.reshow,
        }] : []),
        {
            key: 'guide',
            label: 'Game guide',
            icon: '📖',
            onClick: gameGuide.openGuide,
        },
        ...(!complete ? [{
            key: 'end',
            label: 'End game',
            icon: '🏳️',
            danger: true,
            onClick: endGame,
        }] : []),
    ];

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
        <GameShell title="Dice Cities" subtitle={subtitle} options={displayed ? menuOptions : undefined} syncing={submitting} log={{ entries: nav.displayedHistory, userIdList, viewerId: myUserId, onReact: nav.isLive ? historyReact : undefined }} chat={{ gameId, userIdList, usernameList }}>
            <FcmTokenComp />

            {gameGuide.open && <GameGuideModal guide={buildDiceCitiesGuide(theme)} onClose={gameGuide.closeGuide} />}

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
                    extraParams={rematchTheme(theme.id)}
                />
            )}

            {seats.length > 0 && (
                // The sky is the one part of the board a theme repaints without
                // any art: `--ag-dc-sky-*` are the two stops of the gradient
                // .ag-dc-area draws, which falls back to the original blue if
                // they're ever unset.
                <div
                    className="ag-board-area ag-dc-area"
                    style={{ "--ag-dc-sky-1": theme.sky[0], "--ag-dc-sky-2": theme.sky[1] } as CSSProperties}
                >
                    <DiceCitiesLandmarkTrack
                        seats={seats}
                        userIdList={userIdList}
                        myUserId={myUserId}
                        enabledDocks={enabledDocks}
                        theme={theme}
                    />
                    {seats.map(p => (
                        <DiceCitiesBoard key={p.userId} playerState={p} isViewer={p.userId === myUserId} theme={theme} />
                    ))}
                </div>
            )}

            {nav.isLive && !complete && (
                <ReadOnlyPanel readOnly={!isMyTurn}>{turnSheet}</ReadOnlyPanel>
            )}

            <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} userIdList={userIdList} />
        </GameShell>
    );
}
