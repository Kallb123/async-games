'use client'

import { IDiceCitiesCard, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCards } from "@/games/DiceCities/cards";
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
