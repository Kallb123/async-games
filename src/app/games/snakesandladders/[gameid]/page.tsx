'use client'
import { use } from "react";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ISnakesAndLaddersGameDataResponse } from "@/games/SnakesAndLadders/apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import GameFinishBanner from "@/components/ui/GameFinishBanner";
import SnakesAndLaddersBoard from "@/games/SnakesAndLadders/components/SnakesAndLaddersBoard";
import SnakesAndLaddersPlayerActions from "@/games/SnakesAndLadders/components/SnakesAndLaddersPlayerActions";
import SnakesAndLaddersRollResult, { buildRollResult, RollResult } from "@/games/SnakesAndLadders/components/SnakesAndLaddersRollResult";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecap from "@/components/games/TurnRecap";
import { useAuthGuard } from "@/utils/hooks/useAuthGuard";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { useGameData } from "@/utils/hooks/useGameData";
import { useSubmitCommand, type SubmitCommand } from "@/utils/hooks/useSubmitCommand";
import { ISnakesAndLaddersGameStateResponse } from "@/games/SnakesAndLadders/apiModels";
import { ISnakesAndLaddersDiceRollOutcome, SnakesAndLaddersRequestDiceRoll } from "@/utils/apiModels/GameLogic";
import { SL_REROLL_PARAM } from "@/games/SnakesAndLadders/ui";
import { rematchFlag } from "@/utils/ui/rematch";
import { PLAYER_COLOURS } from "@/utils/ui/playerColours";
import { abandonedGameCopy, currentUsername } from "@/utils/ui/players";

export default function GameSnakesAndLadders({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user } = useAuthGuard();
    const [showLog, setShowLog] = useState(false);
    // The post-roll payoff screen lives here (not in the actions component) so
    // it survives the roll advancing the turn to the next player.
    const [rollResult, setRollResult] = useState<RollResult | null>(null);
    // Re-roll-on-6 games keep the turn with the roller, and nothing in the
    // persisted state distinguishes that bonus roll from a first roll — so the
    // last outcome is remembered here purely to label the roll as "again".
    const [bonusRoll, setBonusRoll] = useState(false);

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<ISnakesAndLaddersGameDataResponse>(gameId);

    const { submitCommand, submitting } = useSubmitCommand<ISnakesAndLaddersGameDataResponse>(gameId, user, setGameData, getGameData);

    const live = {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    };
    const nav = useTurnNavigation<ISnakesAndLaddersGameStateResponse>(gameId, live);

    // "Since you were last here": on open, if turns elapsed since our last move,
    // show the recap intro before the board. Dismissing (or the CTA) reveals it.
    const recap = useTurnRecap(gameId);
    const { endGame } = useEndGame(gameId);

    // Planning submit: instead of persisting a move, add it as a hypothetical
    // planned turn and reuse the same action panel + dice animation.
    const planSubmit: SubmitCommand = async (command, callback) => {
        if (!user) {
            return;
        }
        command.gameId = gameId;
        command.senderId = user.id;
        command.senderUsername = user.username || user.firstName || user.id;
        const result = await nav.planMove(command);
        const roll = (result?.resolvedCommand as { recordedRoll?: number } | undefined)?.recordedRoll;
        const outcome: ISnakesAndLaddersDiceRollOutcome = {
            validMove: true,
            turnOver: true,
            roll: roll ?? 0,
            newPosition: 0,
            landedOnSnake: false,
            landedOnLadder: false,
            extraRoll: false,
        };
        callback?.({ outcome, gameData } as ICommandResponse);
    };

    const boardState = nav.displayedState;
    const complete = nav.displayedComplete;
    const isMyTurn = nav.isLive && user?.id === gameData?.currentTurn;

    // userId → colour, following the persistent usernameList ordering so a
    // player keeps the same swatch on the board and the scoreboard.
    const usernameList = gameData?.usernameList ?? [];
    const players = boardState?.playerStates ? Object.values(boardState.playerStates) : [];
    const colorForUserId = (userId: string): string => {
        const ps = players.find(p => p.userId === userId);
        const idx = ps ? usernameList.indexOf(ps.username) : -1;
        return PLAYER_COLOURS[(idx >= 0 ? idx : 0) % PLAYER_COLOURS.length];
    };

    const displayedCurrentTurn = nav.displayedCurrentTurn;
    const displayedWinner = nav.displayedWinner;
    const leaderPosition = players.reduce((m, p) => Math.max(m, p.position), 0);

    const playerName = (userId?: string): string =>
        players.find(p => p.userId === userId)?.username ?? userId ?? "";
    const getWinnerDisplayName = (): string => playerName(displayedWinner);
    const getForfeitedByDisplayName = (): string => playerName(gameData?.forfeitedBy);
    const currentTurnUsername = players.find(p => p.userId === displayedCurrentTurn)?.username ?? "";
    const currentUserWon = complete && user?.id !== undefined && user.id === displayedWinner;
    const abandoned = complete && gameData?.endReason === 'abandoned';
    const myUsername = currentUsername(user);

    // ── Top-bar status line ──────────────────────────────────────────────────
    let subtitle: React.ReactNode = 'Loading…';
    if (boardState) {
        if (abandoned) {
            subtitle = abandonedGameCopy(getForfeitedByDisplayName()).subtitle;
        } else if (complete) {
            subtitle = currentUserWon ? '🏆 You won!' : `${getWinnerDisplayName()} won`;
        } else if (isMyTurn) {
            subtitle = <><span className="ag-hi">Your move</span> · {bonusRoll ? 'roll again' : 'roll the die'}</>;
        } else {
            subtitle = <>{currentTurnUsername}&apos;s move</>;
        }
    }

    // ── Scoreboard: each player's square is their score ──────────────────────
    const scoreEntries: ScoreEntry[] = boardState
        ? usernameList.flatMap((username, i): ScoreEntry[] => {
            const ps = boardState.playerStates?.[username];
            if (!ps) return [];
            const isMe = ps.userId === user?.id;
            const isActive = ps.userId === displayedCurrentTurn && !complete;
            let sub: React.ReactNode;
            if (isActive) sub = '▶ now';
            else if (ps.position === leaderPosition && leaderPosition > 0) sub = '👑 lead';
            else sub = `sq ${ps.position}`;
            return [{
                id: username,
                name: isMe ? 'You' : username,
                color: PLAYER_COLOURS[i % PLAYER_COLOURS.length],
                sub,
                score: ps.position,
                isMe,
                isActive,
            }];
        })
        : [];

    const myPosition = gameData?.specificGameState?.playerStates
        ? Object.values(gameData.specificGameState.playerStates).find(p => p.userId === user?.id)?.position ?? 0
        : 0;

    const reRollOnSix = gameData?.specificGameState?.reRollOnSix === true;

    // Roll live: capture the pre-roll square, submit, then show the payoff
    // screen. A roll normally ends the turn server-side, so the actions unmount
    // — the result screen is rendered from the page and stays put.
    const handleRoll = () => {
        const from = myPosition;
        const command = new SnakesAndLaddersRequestDiceRoll();
        submitCommand(command, (commandResponse) => {
            const outcome = commandResponse.outcome as ISnakesAndLaddersDiceRollOutcome;
            setRollResult(buildRollResult(command.id, from, outcome));
            setBonusRoll(outcome.extraRoll === true);
        });
    };

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
    const optionsMenu = boardState ? <GameOptionsMenu options={menuOptions} /> : undefined;

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
                cta={{ label: "Roll the die →", onClick: recap.dismiss }}
                backHref="/"
                onReact={recap.react}
            />
        );
    }

    return (
        <GameShell title="Snakes & Ladders" subtitle={subtitle} right={optionsMenu} syncing={submitting}>
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {complete && (
                <GameFinishBanner
                    message={abandoned
                        ? abandonedGameCopy(getForfeitedByDisplayName()).message
                        : currentUserWon ? 'You won! 🎉' : `${getWinnerDisplayName()} won! Better luck next time.`}
                    gameId={gameId}
                    gameUrl="snakesandladders"
                    usernameList={usernameList}
                    myUsername={myUsername}
                    turnTimer={gameData?.turnTimer}
                    extraParams={rematchFlag(SL_REROLL_PARAM, reRollOnSix)}
                />
            )}

            {boardState?.playerStates && (
                <SnakesAndLaddersBoard
                    playerStates={boardState.playerStates}
                    colorFor={colorForUserId}
                    myUserId={user?.id}
                />
            )}

            {isMyTurn && !complete && (
                <SnakesAndLaddersPlayerActions
                    hasRolled={gameData?.specificGameState?.hasRolled ?? false}
                    mode="live"
                    onRoll={handleRoll}
                    pending={submitting}
                    reRollOnSix={reRollOnSix}
                    bonusRoll={bonusRoll}
                />
            )}

            {rollResult && (
                <SnakesAndLaddersRollResult
                    key={rollResult.id}
                    result={rollResult}
                    onDismiss={() => { setRollResult(null); getGameData(); }}
                />
            )}

            <TurnNavControls
                nav={nav as unknown as ReturnType<typeof useTurnNavigation>}
                canPlan={!complete}
                planningActions={
                    <SnakesAndLaddersPlayerActions
                        hasRolled={false}
                        mode="plan"
                        submitCommand={planSubmit}
                    />
                }
            />

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
