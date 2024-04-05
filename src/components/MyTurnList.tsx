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
          .then(data => setGameList(data.gameList));
      }
    }, [isLoaded]);

    return (
        <>
            <h2>Your Turn</h2>
            <ul>
                {gameList.map((game: GameResponse) => (
                    <li key={game.gameId}>{game.usernameList.map(user => (<span key={user}>{user} </span>))}</li>
                ))}
            </ul>
        </>
    );
}
