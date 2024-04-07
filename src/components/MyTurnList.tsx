'use client'

import { GameResponse } from "@/utils/mongodb/GameData";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function MyTurnList() {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const [gameList, setGameList] = useState([] as GameResponse[]);

    useEffect(() => {
        window.addEventListener('NewInvite', () => {
            console.log(`MyTurnList message received: NewInvite`);
            refreshContent();
        });
        window.addEventListener('GameStart', () => {
            console.log(`MyTurnList message received: GameStart`);
            refreshContent();
        });
        window.addEventListener('TurnTaken', () => {
            console.log(`MyTurnList message received: TurnTaken`);
            refreshContent();
        });

        refreshContent();
    }, [isLoaded]);

    const refreshContent = async () => {
        console.log('Refresh my turn list');
        if (isLoaded) {
            if (!user) {
                router.push('/login');
            }
    
            // Use `user` to render user details or create UI elements
            const unlocked = user?.publicMetadata.unlocked;
          
            if (unlocked !== true) {
              router.push('/unlockaccess');
            }
  
            fetch('/api/game/myturnlist')
            .then(response => response.json())
            .then(data => {if (data && data.gameList) setGameList(data.gameList)});
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
            <h2>Your Turn</h2>
            <ul>
                {gameList.map((game: GameResponse) => (
                    <li key={game.gameId} onClick={() => {handleClick(game.gameId);}}>{game.usernameList.map(user => (<span key={user}>{user} </span>))}</li>
                ))}
            </ul>
        </>
    );
}
