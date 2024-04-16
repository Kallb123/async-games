'use client'

import { IDiceCitiesCard, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCardIds, DiceCitiesCards } from "@/games/DiceCities/cards";
import { IGameCommand, RequestCardPurchase, RequestDiceRoll } from "@/utils/apiModels/GameLogic";
import { deserializeJSON } from "@/utils/apiModels/Serialisable";
import DiceRoll from "@/utils/games/DiceRoll";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { Button } from "react-bootstrap";

interface DiceCitiesPlayerProps {
    playerState: IDiceCitiesPlayerStateResponse,
    userName: string
}

export default function DiceCitiesPlayerActions({playerState, userName}: DiceCitiesPlayerProps) {
    
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
        const roll = await DiceRoll(6);
        const myCommands: IGameCommand[] = [];
        myCommands.push(new RequestDiceRoll());
        const cardPurchase = new RequestCardPurchase();
        cardPurchase.cardId = DiceCitiesCardIds.WHEAT_FIELD;
        myCommands.push(cardPurchase);
        console.log("Original array")
        myCommands.forEach(c => console.log(c.toString()));
        const stringify = JSON.stringify(myCommands);
        const newArray: IGameCommand[] = deserializeJSON(stringify);
        console.log("New array")
        newArray.forEach(c => console.log(c.toString()));
        const crapArray: IGameCommand[] = JSON.parse(stringify);
        console.log("Crap array")
        crapArray.forEach(c => console.log(c.toString()));
    }

    const rollDice12 = async () => {
        const roll = await DiceRoll(12);
    }

    return (
        <>
            <Button onClick={rollDice6}>Roll d6</Button>
            <Button onClick={rollDice12} disabled={!playerState.doubleUnlocked}>Roll 2d6</Button>
        </>
    );
}
