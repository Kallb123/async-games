'use client'
import { use } from "react";
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Col, Row } from "react-bootstrap";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import { ISnakesAndLaddersGameDataResponse } from "@/games/SnakesAndLadders/apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import GameResult from "@/components/GameResult";
import SnakesAndLaddersBoard from "@/components/games/SnakesAndLadders/SnakesAndLaddersBoard";
import SnakesAndLaddersPlayerActions from "@/components/games/SnakesAndLadders/SnakesAndLaddersPlayerActions";
import TurnNavControls from "@/components/games/TurnNavControls";
import GameHistoryList from "@/components/games/GameHistoryList";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";
import { ISnakesAndLaddersGameStateResponse } from "@/games/SnakesAndLadders/apiModels";
import { ISnakesAndLaddersDiceRollOutcome } from "@/utils/apiModels/GameLogic";

export default function GameSnakesAndLadders({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const [gameData, setGameData] = useState({} as ISnakesAndLaddersGameDataResponse);
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
        window.addEventListener('TurnTaken', () => {
            console.log(`SnakesAndLaddersPage message received: TurnTaken`);
            getGameData();
        });
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

    const getWinnerDisplayName = (): string => {
        const playerStates = gameData?.specificGameState?.playerStates;
        if (!playerStates) return gameData?.winner ?? "";
        return Object.values(playerStates).find(p => p.userId === gameData.winner)?.username ?? gameData?.winner ?? "";
    };

    const isMyTurn = user?.id === gameData?.currentTurn;

    const live = {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    };
    const nav = useTurnNavigation<ISnakesAndLaddersGameStateResponse>(gameId, live);

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

    return (
        <main>
            <h1>Snakes and Ladders</h1>
            <h2><a href="/">Home</a></h2>
            <GameResult complete={gameData?.complete ?? false} winnerId={gameData?.winner ?? ""} currentUserId={user?.id} winnerDisplayName={getWinnerDisplayName()} />
            {boardState?.playerStates &&
                <SnakesAndLaddersBoard playerStates={boardState.playerStates} />
            }
            <TurnNavControls
                nav={nav as unknown as ReturnType<typeof useTurnNavigation>}
                canPlan={!gameData?.complete}
                planningActions={
                    <SnakesAndLaddersPlayerActions
                        hasRolled={false}
                        submitCommand={planSubmit}
                    />
                }
            />
            {isMyTurn && !gameData?.complete && nav.isLive && (
                <>
                    <h3>Your Turn</h3>
                    <SnakesAndLaddersPlayerActions
                        hasRolled={gameData?.specificGameState?.hasRolled ?? false}
                        submitCommand={submitCommand}
                    />
                </>
            )}
            <h2>History</h2>
            <Row>
                <Col>
                    <GameHistoryList history={nav.displayedHistory} plannedCount={nav.plannedHistoryCount} />
                </Col>
            </Row>
            <CurrentUserInfo />
            <FcmTokenComp />
        </main>
    );
}
