'use client'

import { IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { DiceCitiesRequestDiceRoll } from "@/utils/apiModels/GameLogic";
import { Button } from "react-bootstrap";

interface DiceCitiesPlayerProps {
    playerState: IDiceCitiesPlayerStateResponse,
    userName: string,
    gameId: uuidString
}

export default function DiceCitiesPlayerActions({playerState, userName, gameId}: DiceCitiesPlayerProps) {
    
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

    const rollDice6 = async () => {
        // const myCommands: IGameCommand[] = [];
        // myCommands.push(new DiceCitiesRequestDiceRoll());
        // const cardPurchase = new DiceCitiesRequestCardPurchase();
        // cardPurchase.cardId = DiceCitiesCardIds.WHEAT_FIELD;
        // myCommands.push(cardPurchase);
        // console.log("Original array")
        // myCommands.forEach(c => console.log(c.toString()));
        // const stringify = JSON.stringify(myCommands);
        // const newArray: IGameCommand[] = deserializeJSON(stringify);
        // console.log("New array")
        // newArray.forEach(c => console.log(c.toString()));
        // const crapArray: IGameCommand[] = JSON.parse(stringify);
        // console.log("Crap array")
        // crapArray.forEach(c => console.log(c.toString()));

        const diceRoll = new DiceCitiesRequestDiceRoll();
        diceRoll.gameId = gameId;
        
        fetch('/api/game/command', {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(diceRoll)
        })
        .then(response => response.json())
        .then(data => {
            console.log(data);
            // TODO: Handle prage update with new data
            // Maybe there should be a higher level "submitCommand" method
        });
    }

    const rollDice12 = async () => {
        const diceRoll = new DiceCitiesRequestDiceRoll();
        diceRoll.gameId = gameId;
        diceRoll.doubleDice = true;
        
        fetch('/api/game/command', {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(diceRoll)
        })
        .then(response => response.json())
        .then(data => console.log(data));
    }

    return (
        <>
            <Button onClick={rollDice6}>Roll d6</Button>
            <Button onClick={rollDice12} disabled={!playerState.doubleUnlocked}>Roll 2d6</Button>
        </>
    );
}
