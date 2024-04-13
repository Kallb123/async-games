'use client'

import { IDiceCitiesCard, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCards } from "@/games/DiceCities/cards";

interface DiceCitiesPlayerProps {
    playerState: IDiceCitiesPlayerStateResponse,
    userId: string
}

export default function DiceCitiesPlayer({playerState, userId}: DiceCitiesPlayerProps) {
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
            <h2>{userId}</h2>
            <ul>
                <li>Money: {playerState.money}</li>
                <li>
                    <ul>
                        {playerState.cards.map(cardCount => {
                            const card: IDiceCitiesCard = DiceCitiesCards[cardCount.card.toString()];
                            console.log(DiceCitiesCards, cardCount.card.toString(), card);
                            return (
                                <li key={cardCount.card.toString()}>{card.title} x{cardCount.amount}</li>
                            )
                        })}
                    </ul>
                </li>
                <li>Shopping Mall: {playerState.bonusDiningAndStore}</li>
                <li>Train Station: {playerState.doubleUnlocked}</li>
                <li>Amusement Park: {playerState.oneReroll}</li>
                <li>Radio Tower: {playerState.rerollDoubles}</li>
            </ul>
        </>
    );
}
