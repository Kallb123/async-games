import { ICommandResponse } from "@/app/api/game/command/route";
import { IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { DiceCitiesRequestDiceRoll, DiceCitiesRequestPassTurn, IGameCommand } from "@/utils/apiModels/GameLogic";
import { Button } from "react-bootstrap";

interface DiceCitiesPlayerProps {
    hasRolled: boolean,
    playerState: IDiceCitiesPlayerStateResponse,
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>
}

export default function DiceCitiesPlayerActions({playerState, hasRolled, submitCommand}: DiceCitiesPlayerProps) {
    
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
        submitCommand(diceRoll, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    const rollDice12 = async () => {
        const diceRoll = new DiceCitiesRequestDiceRoll();
        diceRoll.doubleDice = true;
        submitCommand(diceRoll, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    const passTurn = async () => {
        const pass = new DiceCitiesRequestPassTurn();
        submitCommand(pass, (commandResponse) => {

        });
    }

    return (
        <>
            <Button onClick={rollDice6} disabled={hasRolled}>Roll d6</Button>
            <Button onClick={rollDice12} disabled={hasRolled || !playerState.doubleUnlocked}>Roll 2d6</Button>
            <Button onClick={passTurn} disabled={!hasRolled}>Pass Without Buying</Button>
        </>
    );
}
