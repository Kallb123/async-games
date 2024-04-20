'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Col, Form, Row } from "react-bootstrap";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import DiceCitiesPlayer from "@/components/games/DiceCities/DiceCitiesPlayer";
import { IDiceCitiesGameDataResponse } from "@/games/DiceCities/apiModels";
import DiceCitiesBank from "@/components/games/DiceCities/DiceCitiesBank";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { IGameCommand } from "@/utils/apiModels/GameLogic";
import { ICommandResponse } from "@/app/api/game/command/route";

export default function GameDiceCities({ params }: { params: { gameid: uuidString } }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const [gameData, setGameData] = useState({} as IDiceCitiesGameDataResponse);
    const router = useRouter();

    const gameId = params.gameid;

    // TODO: listen for TurnTaken events

    useEffect(() => {
        if (isLoaded) {
            if (!user) {
                router.push('/login');
            }

            // Use `user` to render user details or create UI elements
            const unlocked = user?.publicMetadata.unlocked;
        
            if (unlocked !== true) {
            router.push('/unlockaccess');
            }

            getGameData();
        }
        window.addEventListener('TurnTaken', () => {
            console.log(`DiceCitiesPage message received: TurnTaken`);
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

    const handleTakeTurn = async () => {
        fetch('/api/game/taketurn', {
            method: "POST",
            headers: {
            'Content-Type': 'application/json'
            },
            body: JSON.stringify({gameId})
        })
        .then(response => response.json())
        .then(data => console.log(data));
    }

    const submitCommand = async (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => {
        command.gameId = gameId;
        if (!user) {
            console.error("Unable to send command whilst not logged in");
            return;
        }
        command.senderId = user.id;
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
            // TODO: Handle prage update with new data
            // Maybe there should be a higher level "submitCommand" method
            const response: ICommandResponse = data;
            setGameData(response.gameData as IDiceCitiesGameDataResponse);
            callback(data);
        });
    }

    return (
        <main>
            <h1>Dice Cities</h1>
            <h2><a href="/">Home</a></h2>
            <Form>
                <Row>
                    <Col>
                        {gameData?.specificGameState?.playerStates ? Object.keys(gameData.specificGameState.playerStates).map(userName => (
                            <DiceCitiesPlayer key={userName} userName={userName} currentTurn={gameData.currentTurn} hasRolled={gameData.specificGameState.hasRolled} submitCommand={submitCommand} playerState={gameData.specificGameState.playerStates[userName]} />
                        )) : ("")}
                    </Col>
                    <Col>
                        <DiceCitiesBank gameState={gameData?.specificGameState} submitCommand={submitCommand} />
                    </Col>
                </Row>
                <Row>
                    <Col>
                        <ul>
                            {gameData?.gameState?.history ? gameData.gameState.history.map((historyString, index) => (
                                <li key={index}>{historyString}</li>
                            )) : ("")}
                        </ul>
                    </Col>
                </Row>
            </Form>
            <CurrentUserInfo />
            <FcmTokenComp />
        </main>
    );
}
