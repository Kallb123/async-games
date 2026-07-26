'use client'
import { use } from "react";
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ISnakesAndLaddersGameDataResponse } from "@/games/SnakesAndLadders/apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import GameShell from "@/components/ui/GameShell";
import GameOptionsMenu, { GameOption } from "@/components/ui/GameOptionsMenu";
import GameScoreboard, { ScoreEntry } from "@/components/ui/GameScoreboard";
import SnakesAndLaddersBoard from "@/games/SnakesAndLadders/components/SnakesAndLaddersBoard";
import SnakesAndLaddersPlayerActions from "@/games/SnakesAndLadders/components/SnakesAndLaddersPlayerActions";
import SnakesAndLaddersRollResult, { buildRollResult, RollResult } from "@/games/SnakesAndLadders/components/SnakesAndLaddersRollResult";
import TurnNavControls from "@/components/games/TurnNavControls";
import TurnRecap from "@/components/games/TurnRecap";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { useTurnRecap } from "@/utils/hooks/useTurnRecap";
import { useEndGame } from "@/utils/hooks/useEndGame";
import { usePushEvents, TURN_ADVANCED_EVENTS } from "@/utils/hooks/usePushEvents";
import { useGameData } from "@/utils/hooks/useGameData";
import { ISnakesAndLaddersGameStateResponse } from "@/games/SnakesAndLadders/apiModels";
import { ISnakesAndLaddersDiceRollOutcome, SnakesAndLaddersRequestDiceRoll } from "@/utils/apiModels/GameLogic";
import { PLAYER_COLOURS } from "@/utils/ui/playerColours";

export default function GameSnakesAndLadders({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const [showLog, setShowLog] = useState(false);
    // The post-roll payoff screen lives here (not in the actions component) so
    // it survives the roll advancing the turn to the next player.
    const [rollResult, setRollResult] = useState<RollResult | null>(null);
    const router = useRouter();

    const { gameid } = use(params);
    const gameId = gameid;

    const { gameData, setGameData, getGameData } = useGameData<ISnakesAndLaddersGameDataResponse>(gameId);

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
                setGameData(response.gameData as ISnakesAndLaddersGameDataResponse);
                callback(data);
            });
    };

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
    const planSubmit = async (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => {
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
        };
        callback({ outcome, gameData } as ICommandResponse);
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

    const getWinnerDisplayName = (): string =>
        players.find(p => p.userId === displayedWinner)?.username ?? displayedWinner ?? "";
    const currentTurnUsername = players.find(p => p.userId === displayedCurrentTurn)?.username ?? "";
    const currentUserWon = complete && user?.id !== undefined && user.id === displayedWinner;

    // ── Top-bar status line ──────────────────────────────────────────────────
    let subtitle: React.ReactNode = 'Loading…';
    if (boardState) {
        if (complete) {
            subtitle = currentUserWon ? '🏆 You won!' : `${getWinnerDisplayName()} won`;
        } else if (isMyTurn) {
            subtitle = <><span className="ag-hi">Your move</span> · roll the die</>;
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

    // Roll live: capture the pre-roll square, submit, then show the payoff
    // screen. Rolling ends the turn server-side, so the actions unmount — the
    // result screen is rendered from the page and stays put.
    const handleRoll = () => {
        const from = myPosition;
        submitCommand(new SnakesAndLaddersRequestDiceRoll(), (commandResponse) => {
            const outcome = commandResponse.outcome as ISnakesAndLaddersDiceRollOutcome;
            setRollResult(buildRollResult(from, outcome));
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
        <GameShell title="Snakes & Ladders" subtitle={subtitle} right={optionsMenu}>
            <FcmTokenComp />

            {scoreEntries.length > 0 && <GameScoreboard entries={scoreEntries} />}

            {complete && (
                <div className="ag-game-result">
                    <h2>{currentUserWon ? 'You won! 🎉' : `${getWinnerDisplayName()} won! Better luck next time.`}</h2>
                </div>
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
                />
            )}

            {rollResult && (
                <SnakesAndLaddersRollResult
                    result={rollResult}
                    onEndTurn={() => { setRollResult(null); getGameData(); }}
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
