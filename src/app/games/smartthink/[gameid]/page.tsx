'use client'
import { use } from "react";
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Col, Row } from "react-bootstrap";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import GameResult from "@/components/GameResult";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import type { ISmartthinkGameDataResponse } from "@/games/Smartthink/apiModels";
import SmartthinkBoard from "@/components/games/Smartthink/SmartthinkBoard";
import SmartthinkPlayerActions from "@/components/games/Smartthink/SmartthinkPlayerActions";

export default function GameSmartthink({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const [gameData, setGameData] = useState({} as ISmartthinkGameDataResponse);
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
            console.log(`SmartthinkPage message received: TurnTaken`);
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
                setGameData(response.gameData as ISmartthinkGameDataResponse);
                callback(data);
            });
    };

    const getWinnerDisplayName = (): string => {
        const state = gameData?.specificGameState;
        if (!state) return gameData?.winner ?? "";
        if (gameData.winner === state.codeSetterId) return state.codeSetterUsername || gameData.winner;
        if (gameData.winner === state.codeBreakerId) return state.codeBreakerUsername || gameData.winner;
        return state.players?.find(p => p.userId === gameData.winner)?.username ?? gameData?.winner ?? "";
    };

    const isCodeSetter = user?.id === gameData?.specificGameState?.codeSetterId;
    const isCodeBreaker = user?.id === gameData?.specificGameState?.codeBreakerId;
    const isMyTurn = user?.id === gameData?.currentTurn;

    return (
        <main>
            <h1>Smartthink</h1>
            <h2><a href="/">Home</a></h2>
            <GameResult complete={gameData?.complete ?? false} winnerId={gameData?.winner ?? ""} currentUserId={user?.id} winnerDisplayName={getWinnerDisplayName()} />
            {gameData?.specificGameState && (
                <>
                    <SmartthinkBoard
                        guessRows={gameData.specificGameState.guessRows}
                        maxGuesses={gameData.specificGameState.maxGuesses}
                        codeSetterUsername={gameData.specificGameState.codeSetterUsername}
                        codeBreakerUsername={gameData.specificGameState.codeBreakerUsername}
                    />
                    {isMyTurn && !gameData?.complete && (
                        <SmartthinkPlayerActions
                            gameState={gameData.specificGameState}
                            isCodeSetter={isCodeSetter}
                            isCodeBreaker={isCodeBreaker}
                            submitCommand={submitCommand}
                        />
                    )}
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
