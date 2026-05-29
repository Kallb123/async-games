'use client'

import { IGameResponse } from "@/utils/apiModels/GameDataApi";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "react-bootstrap";

export default function TheirTurnList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [gameList, setGameList] = useState([] as IGameResponse[]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        window.addEventListener('NewInvite', () => {
            console.log(`TheirTurnList message received: NewInvite`);
            refreshContent();
        });
        window.addEventListener('GameStart', () => {
            console.log(`TheirTurnList message received: GameStart`);
            refreshContent();
        });
        window.addEventListener('TurnTaken', () => {
            console.log(`TheirTurnList message received: TurnTaken`);
            refreshContent();
        });

        refreshContent();
    }, [isLoaded]);

    const refreshContent = async () => {
        console.log('Refresh their turn list');
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
            fetch('/api/game/theirturnlist')
            .then(response => response.json())
            .then(data => {if (data && data.gameList) setGameList(data.gameList)})
            .catch(error => console.error('Failed to load their turn list', error))
            .finally(() => setIsLoading(false));
        }
    }

    const handleEndGame = async (gameId: `${string}-${string}-${string}-${string}-${string}`) => {
        fetch('/api/game/end', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ gameId })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to end game');
            }
            return response.json();
        })
        .then(() => refreshContent())
        .catch(error => console.error('Failed to end game', error));
    }

    return (
        <>
            <h2>Their Turn</h2>
            {isLoading && <Spinner animation="border" role="status" size="sm"><span className="visually-hidden">Loading...</span></Spinner>}
            {gameList.map((game: IGameResponse) => (
                <div key={game.gameId}>
                    <a href={`/games/${game.url}/${game.gameId}`}>Not your turn in <span style={{fontWeight: "bold"}}>{game.friendlyName}</span> with <span style={{fontWeight: "bold"}}>{game.usernameList.filter(u => u !== user?.username).map(user => (<span key={user}>{user} </span>))}</span></a>
                    <button type="button" className="btn btn-link p-0 ms-2" onClick={() => handleEndGame(game.gameId)}>End game</button>
                </div>
            ))}
        </>
    );
}
