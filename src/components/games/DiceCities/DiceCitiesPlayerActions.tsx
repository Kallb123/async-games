import { ICommandResponse } from "@/app/api/game/command/route";
import { IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { DiceCitiesRequestDiceRoll, DiceCitiesRequestPassTurn, DiceCitiesRequestRadioTowerReroll, IGameCommand } from "@/utils/apiModels/GameLogic";
import { Button } from "react-bootstrap";

interface DiceCitiesPlayerProps {
    hasRolled: boolean,
    playerState: IDiceCitiesPlayerStateResponse,
    awaitingSteal: boolean,
    hasReRolled: boolean,
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>
}

export default function DiceCitiesPlayerActions({playerState, hasRolled, hasReRolled, awaitingSteal, submitCommand}: DiceCitiesPlayerProps) {
    const rollDice6 = async () => {
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

    const reRoll = async () => {
        const reRollCommand = new DiceCitiesRequestRadioTowerReroll();
        submitCommand(reRollCommand, (commandResponse) => {

        });
    }

    return (
        <>
            <Button onClick={rollDice6} disabled={hasRolled || awaitingSteal}>Roll d6</Button>
            <Button onClick={rollDice12} disabled={hasRolled || awaitingSteal || !playerState.doubleUnlocked}>Roll 2d6</Button>
            <Button onClick={passTurn} disabled={!hasRolled}>Pass Without Buying</Button>
            {playerState.oneReroll ? <Button onClick={reRoll} disabled={!hasRolled || hasReRolled}></Button> : ""}
        </>
    );
}
