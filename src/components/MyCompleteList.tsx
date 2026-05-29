'use client'

import { IGameResponse } from "@/utils/apiModels/GameDataApi";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "react-bootstrap";

export default function MyCompleteList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [gameList, setGameList] = useState([] as IGameResponse[]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        window.addEventListener('GameOver', () => {
            console.log(`MyTurnList message received: GameStart`);
            refreshContent();
        });

        refreshContent();
    }, [isLoaded]);

    const refreshContent = async () => {
        console.log('Refresh my complete list');
        if (isLoaded) {
            if (!user) {
                router.push('/login');
            }
    
            // Use `user` to render user details or create UI elements
            const unlocked = user?.publicMetadata.unlocked;
          
            if (unlocked !== true) {
              router.push('/unlockaccess');
            }
  
            setIsLoading(true);
            fetch('/api/game/mycompletelist')
            .then(response => response.json())
            .then(data => {if (data && data.gameList) setGameList(data.gameList)})
            .catch(error => console.error('Failed to load complete games', error))
            .finally(() => setIsLoading(false));
        }
    }

    const handleClick = async (gameId: `${string}-${string}-${string}-${string}-${string}`) => {
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
        <>
            <h2>Complete Games</h2>
            {isLoading && <Spinner animation="border" role="status" size="sm"><span className="visually-hidden">Loading...</span></Spinner>}
            {gameList.map((game: IGameResponse) => (
                <div key={game.gameId}>
                    Game of <span style={{fontWeight: "bold"}}>{game.friendlyName}</span> complete! <span style={{fontWeight: "bold"}}>{game.winner}</span> won!
                </div>
            ))}
        </>
    );
}
