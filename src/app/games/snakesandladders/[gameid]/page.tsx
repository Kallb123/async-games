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

    return (
        <main>
            <h1>Snakes and Ladders</h1>
            <h2><a href="/">Home</a></h2>
            <GameResult complete={gameData?.complete ?? false} winnerId={gameData?.winner ?? ""} currentUserId={user?.id} winnerDisplayName={getWinnerDisplayName()} />
            {gameData?.specificGameState?.playerStates &&
                <SnakesAndLaddersBoard playerStates={gameData.specificGameState.playerStates} />
            }
            {isMyTurn && !gameData?.complete && (
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
                    <ul>
                        {gameData?.gameState?.history ? gameData.gameState.history.map((historyString, index) => (
                            <li key={index}>{historyString}</li>
                        )) : ""}
                    </ul>
                </Col>
            </Row>
            <CurrentUserInfo />
            <FcmTokenComp />
        </main>
    );
}
