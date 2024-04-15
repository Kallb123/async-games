'use client'
import { useUser } from "@clerk/nextjs";
import { FcmTokenComp } from "@/components/FirebaseForeground";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Col, Form, Row } from "react-bootstrap";
import CurrentUserInfo from "@/components/CurrentUserInfo";
import DiceCitiesPlayer from "@/components/games/DiceCities/DiceCitiesPlayer";
import { IDiceCitiesGameDataResponse } from "@/games/DiceCities/apiModels";
import DiceCitiesBank from "@/components/games/DiceCities/DiceCitiesBank";

export default function GameDiceCities({ params }: { params: { gameid: string } }) {
  const pathName = usePathname();
  console.log(`GET ${pathName}`);
  const { user, isLoaded } = useUser();
  const [gameData, setGameData] = useState({} as IDiceCitiesGameDataResponse);
  const router = useRouter();

  const gameId = params.gameid;

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
    }, [isLoaded]);

    const getGameData = async () => {
        fetch(`/api/game/${gameId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error("Game not found");
            }
            return response.json();
        })
        .then(data => {if (data) setGameData(data.gameData)})
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

    return (
        <main>
            <h1>Dice Cities</h1>
            <h2><a href="/">Home</a></h2>
            <Form>
                <Row>
                    <Col>
                        <Button onClick={handleTakeTurn}>Take Turn</Button>
                    </Col>
                </Row>
            <Row>
                <Col>
                    {gameData?.specificGameState?.playerStates ? Object.keys(gameData.specificGameState.playerStates).map(userName => (
                        <DiceCitiesPlayer key={userName} userName={userName} playerState={gameData.specificGameState.playerStates[userName]} />
                    )) : ("")}
                </Col>
                <Col>
                    <DiceCitiesBank gameState={gameData?.specificGameState} />
                </Col>
            </Row>
            </Form>
            <CurrentUserInfo />
            <FcmTokenComp />
        </main>
    );
}
