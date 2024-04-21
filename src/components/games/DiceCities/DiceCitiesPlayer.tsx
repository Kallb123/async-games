import { IDiceCitiesCard, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCardIds, DiceCitiesCards } from "@/games/DiceCities/cards";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import DiceCitiesPlayerActions from "./DiceCitiesPlayerActions";
import { DiceCitiesRequestTvStationSelection, DiceCitiesRequestUnlockAmusementPark, DiceCitiesRequestUnlockRadioTower, DiceCitiesRequestUnlockShoppingMall, DiceCitiesRequestUnlockTrainStation, IGameCommand } from "@/utils/apiModels/GameLogic";
import { ICommandResponse } from "@/app/api/game/command/route";
import { Button } from "react-bootstrap";

interface DiceCitiesPlayerProps {
    playerState: IDiceCitiesPlayerStateResponse,
    userName: string,
    hasRolled: boolean,
    currentTurn: string,
    awaitingTSSelection: boolean,
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>
}

export default function DiceCitiesPlayer({playerState, userName, currentTurn, hasRolled, awaitingTSSelection, submitCommand}: DiceCitiesPlayerProps) {
    const { user, isLoaded } = useUser();
    const [isMe, setIsMe] = useState(false);
    const [myTurn, setMyTurn] = useState(false);

    useEffect(() => {
      if (isLoaded) {
        if (user?.username === userName) {
            setIsMe(true);
        } else {
            setIsMe(false);
        }
        if (currentTurn === user?.id) {
            setMyTurn(true);
        } else {
            setMyTurn(false);
        }
      }
    }, [isLoaded, currentTurn]);

    const purchaseShoppingMall = () => {
        const command = new DiceCitiesRequestUnlockShoppingMall();
        submitCommand(command, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    const purchaseTrainStation = () => {
        const command = new DiceCitiesRequestUnlockTrainStation();
        submitCommand(command, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    const purchaseAmusementPark = () => {
        const command = new DiceCitiesRequestUnlockAmusementPark();
        submitCommand(command, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    const purchaseRadioTower = () => {
        const command = new DiceCitiesRequestUnlockRadioTower();
        submitCommand(command, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    const selectForTS = () => {
        const command = new DiceCitiesRequestTvStationSelection();
        command.selectedUser = userName;
        submitCommand(command, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    return (
        <>
            <h2>{userName}</h2>
            {awaitingTSSelection && !isMe && myTurn ? 
            <Button onClick={selectForTS}>Steal up to 5 coins</Button>
            : ""}
            <ul>
                <li>Money: {playerState.money}</li>
                <li>
                    <ul>
                        <li>Cards</li>
                        {playerState.cards.map(cardCount => {
                            const card: IDiceCitiesCard = DiceCitiesCards[cardCount.card.toString()];
                            return (
                                <li key={cardCount.card.toString()} title={card.text}>{card.title} x{cardCount.amount}</li>
                            )
                        })}
                    </ul>
                </li>
                <li title={DiceCitiesCards[DiceCitiesCardIds.SHOPPING_MALL].text}>Shopping Mall: {playerState.bonusDiningAndStore ? "True" : "False"} {myTurn && isMe && playerState && !playerState.bonusDiningAndStore ? <Button onClick={purchaseShoppingMall} disabled={DiceCitiesCards[DiceCitiesCardIds.SHOPPING_MALL].cost > playerState.money || !hasRolled}>Unlock</Button> : ""}</li>
                <li title={DiceCitiesCards[DiceCitiesCardIds.TRAIN_STATION].text}>Train Station: {playerState.doubleUnlocked ? "True" : "False"} {myTurn && isMe && playerState && !playerState.doubleUnlocked ? <Button onClick={purchaseTrainStation} disabled={DiceCitiesCards[DiceCitiesCardIds.TRAIN_STATION].cost > playerState.money || !hasRolled}>Unlock</Button> : ""}</li>
                <li title={DiceCitiesCards[DiceCitiesCardIds.AMUSEMENT_PARK].text}>Amusement Park: {playerState.oneReroll ? "True" : "False"} {myTurn && isMe && playerState && !playerState.oneReroll ? <Button onClick={purchaseAmusementPark} disabled={DiceCitiesCards[DiceCitiesCardIds.AMUSEMENT_PARK].cost > playerState.money || !hasRolled}>Unlock</Button> : ""}</li>
                <li title={DiceCitiesCards[DiceCitiesCardIds.RADIO_TOWER].text}>Radio Tower: {playerState.rerollDoubles ? "True" : "False"} {myTurn && isMe && playerState && !playerState.rerollDoubles ? <Button onClick={purchaseRadioTower} disabled={DiceCitiesCards[DiceCitiesCardIds.RADIO_TOWER].cost > playerState.money || !hasRolled}>Unlock</Button> : ""}</li>
            </ul>
            {isMe && currentTurn === user?.id ? (
                <DiceCitiesPlayerActions playerState={playerState} hasRolled={hasRolled} awaitingSteal={awaitingTSSelection} submitCommand={submitCommand} />
            ) : null}
        </>
    );
}
