'use client'

import { IDiceCitiesCard, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCards } from "@/games/DiceCities/cards";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import DiceCitiesPlayerActions from "./DiceCitiesPlayerActions";

interface DiceCitiesPlayerProps {
    playerState: IDiceCitiesPlayerStateResponse,
    userName: string
}

export default function DiceCitiesPlayer({playerState, userName}: DiceCitiesPlayerProps) {
    const { user, isLoaded } = useUser();
    const [isMe, setIsMe] = useState(false);

    useEffect(() => {
      if (isLoaded) {
        if (user?.username === userName) {
            setIsMe(true);
        } else {
            setIsMe(false);
        }
      }
    }, [isLoaded]);
    
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
            <h2>{userName}</h2>
            <ul>
                <li>Money: {playerState.money}</li>
                <li>
                    <ul>
                        <li>Cards</li>
                        {playerState.cards.map(cardCount => {
                            const card: IDiceCitiesCard = DiceCitiesCards[cardCount.card.toString()];
                            return (
                                <li key={cardCount.card.toString()}>{card.title} x{cardCount.amount}</li>
                            )
                        })}
                    </ul>
                </li>
                <li>Shopping Mall: {playerState.bonusDiningAndStore ? "True" : "False"}</li>
                <li>Train Station: {playerState.doubleUnlocked ? "True" : "False"}</li>
                <li>Amusement Park: {playerState.oneReroll ? "True" : "False"}</li>
                <li>Radio Tower: {playerState.rerollDoubles ? "True" : "False"}</li>
            </ul>
            {isMe ? (
                <DiceCitiesPlayerActions playerState={playerState} userName={userName} />
            ) : null}
        </>
    );
}
