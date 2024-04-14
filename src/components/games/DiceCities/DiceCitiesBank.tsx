'use client'

import { IDiceCitiesCard, IDiceCitiesGameStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCards } from "@/games/DiceCities/cards";

interface DiceCitiesBankProps {
    gameState: IDiceCitiesGameStateResponse
}

export default function DiceCitiesBank({gameState}: DiceCitiesBankProps) {
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
            <h2>Bank</h2>
            <ul>
                {/* <li>Money: ???</li> */}
                <li>
                    <ul>
                        {gameState.bankCards.map(cardCount => {
                            const card: IDiceCitiesCard = DiceCitiesCards[cardCount.card.toString()];
                            console.log(DiceCitiesCards, cardCount.card.toString(), card);
                            return (
                                <li key={cardCount.card.toString()}>{card.title} x{cardCount.amount}</li>
                            )
                        })}
                    </ul>
                </li>
            </ul>
        </>
    );
}
