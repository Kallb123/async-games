'use client'
import { use } from "react";
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Col, Form, Row } from "react-bootstrap";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import DiceCitiesPlayer from "@/components/games/DiceCities/DiceCitiesPlayer";
import { IDiceCitiesGameDataResponse, IDiceCitiesGameStateResponse } from "@/games/DiceCities/apiModels";
import DiceCitiesBank from "@/components/games/DiceCities/DiceCitiesBank";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import GameResult from "@/components/GameResult";
import TurnNavControls from "@/components/games/TurnNavControls";
import { useTurnNavigation } from "@/utils/hooks/useTurnNavigation";

// Sentinel used as "current turn" while reviewing a past turn, so no player's
// interactive controls activate (they gate on currentTurn === the logged-in user).
const NO_ACTIVE_TURN = "__recap__";
const noopSubmit = async () => {};

export default function GameDiceCities({ params }: { params: Promise<{ gameid: uuidString }> }) {
    const pathName = usePathname();
    console.log(`GET ${pathName}`);
    const { user, isLoaded } = useUser();
    const [gameData, setGameData] = useState({} as IDiceCitiesGameDataResponse);
    const router = useRouter();

    const { gameid } = use(params);
    const gameId = gameid;

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
            // TODO: Handle prage update with new data
            // Maybe there should be a higher level "submitCommand" method
            const response: ICommandResponse = data;
            if (!response || !response.gameData) {
                return;
            }
            setGameData(response.gameData as IDiceCitiesGameDataResponse);
            callback(data);
        });
    }

    const getWinnerDisplayName = (): string => {
        const playerStates = gameData?.specificGameState?.playerStates;
        if (!playerStates) return gameData?.winner ?? "";
        return Object.values(playerStates).find(p => p.userId === gameData.winner)?.username ?? gameData?.winner ?? "";
    };

    const live = {
        specificGameState: gameData?.specificGameState,
        currentTurn: gameData?.currentTurn ?? "",
        complete: gameData?.complete ?? false,
        winner: gameData?.winner ?? "",
        history: gameData?.gameState?.history ?? [],
    };
    const nav = useTurnNavigation<IDiceCitiesGameStateResponse>(gameId, live);
    const displayed = nav.displayedState;
    // While reviewing a past turn, disable all interactive controls.
    const controlsCurrentTurn = nav.isLive ? nav.displayedCurrentTurn : NO_ACTIVE_TURN;
    const controlsSubmit = nav.isLive ? submitCommand : noopSubmit;

    return (
        <main>
            <h1>Dice Cities</h1>
            <h2><a href="/">Home</a></h2>
            <GameResult complete={gameData?.complete ?? false} winnerId={gameData?.winner ?? ""} currentUserId={user?.id} winnerDisplayName={getWinnerDisplayName()} />
            <TurnNavControls nav={nav as unknown as ReturnType<typeof useTurnNavigation>} canPlan={false} />
            <Form>
                {displayed?.playerStates ? Object.keys(displayed.playerStates).map(userName => (
                    <DiceCitiesPlayer key={userName}
                    userName={userName}
                    currentTurn={controlsCurrentTurn}
                    hasRolled={displayed.hasRolled}
                    hasReRolled={displayed.hasReRolled}
                    awaitingTSSelection={displayed.awaitingTSSelection}
                    awaitingBCSelection={displayed.awaitingBCSelectionOwn || displayed.awaitingBCSelectionOpponent}
                    submitCommand={controlsSubmit}
                    playerState={displayed.playerStates[userName]} />
                )) : ("")}
                {displayed && <DiceCitiesBank gameState={displayed} currentTurn={controlsCurrentTurn} submitCommand={controlsSubmit} />}
                <h2>History</h2>
                <Row>
                    <Col>
                        <ul>
                            {nav.displayedHistory.map((historyString, index) => (
                                <li key={index}>{historyString}</li>
                            ))}
                        </ul>
                    </Col>
                </Row>
            </Form>
            <CurrentUserInfo />
            <FcmTokenComp />
        </main>
    );
}
