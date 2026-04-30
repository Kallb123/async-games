import { IDiceCitiesCard, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCardIds, DiceCitiesCards } from "@/games/DiceCities/cards";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import DiceCitiesPlayerActions from "./DiceCitiesPlayerActions";
import { DiceCitiesRequestBusinessCenterOpponentSelection, DiceCitiesRequestBusinessCenterOwnSelection, DiceCitiesRequestTvStationSelection, DiceCitiesRequestUnlockAmusementPark, DiceCitiesRequestUnlockRadioTower, DiceCitiesRequestUnlockShoppingMall, DiceCitiesRequestUnlockTrainStation, IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ICommandResponse } from "@/app/api/game/command/route";
import { Button, Col, Row } from "react-bootstrap";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import DiceCitiesCard from "./DiceCitiesCard";
import DiceCitiesCardStack from "./DiceCitiesCardStack";

interface DiceCitiesPlayerProps {
    playerState: IDiceCitiesPlayerStateResponse,
    userName: string,
    hasRolled: boolean,
    hasReRolled: boolean,
    currentTurn: string,
    awaitingTSSelection: boolean,
    awaitingBCSelection: boolean,
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>
}

export default function DiceCitiesPlayer({playerState, userName, currentTurn, hasRolled, hasReRolled, awaitingTSSelection, awaitingBCSelection, submitCommand}: DiceCitiesPlayerProps) {
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
        command.selectedUser = playerState.userId;
        command.selectedUserName = userName;
        submitCommand(command, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    const selectForBC = (cardId: uuidString) => {
        if (isMe) {
            selectOwnBC(cardId);
        } else {
            selectOpponentBC(cardId);
        }
    }

    const selectOwnBC = (cardId: uuidString) => {
        const command = new DiceCitiesRequestBusinessCenterOwnSelection();
        command.selectedCard = cardId;
        submitCommand(command, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    const selectOpponentBC = (cardId: uuidString) => {
        const command = new DiceCitiesRequestBusinessCenterOpponentSelection();
        command.selectedUser = playerState.userId;
        command.selectedCard = cardId;
        submitCommand(command, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    return (
        <>
            <h2>{userName}{playerState.userId === currentTurn ? " *" : ""}</h2>
            {awaitingTSSelection && !isMe && myTurn ? 
            <Button onClick={selectForTS}>Steal up to 5 coins</Button>
            : ""}
            <h3>Money: {playerState.money}</h3>
            <h3>Cards</h3>
            <Row>
                {[...playerState.cards].sort((cc1, cc2) => DiceCitiesCards[cc1.card].rollNumber[0] - DiceCitiesCards[cc2.card].rollNumber[0]).map(cardCount => {
                    if (cardCount.amount === 0) return;
                    const card: IDiceCitiesCard = DiceCitiesCards[cardCount.card];
                    return (
                        <Col key={cardCount.card} title={card.text}><DiceCitiesCardStack card={card} amount={cardCount.amount} disabled={false}></DiceCitiesCardStack> {
                            awaitingBCSelection && myTurn && card.type !== "landmark" ? <Button onClick={() => {selectForBC(cardCount.card)}}>Select to {isMe ? "Give" : "Receive"}</Button> : ""
                        }</Col>
                    )
                })}
            </Row>
            <h3>Landmarks</h3>
            <Row>
                <Col>
                    <div title={DiceCitiesCards[DiceCitiesCardIds.TRAIN_STATION].text}><DiceCitiesCard card={DiceCitiesCards[DiceCitiesCardIds.TRAIN_STATION]} disabled={!playerState.doubleUnlocked}></DiceCitiesCard> {myTurn && isMe && hasRolled && playerState && !playerState.doubleUnlocked ? <Button onClick={purchaseTrainStation} disabled={DiceCitiesCards[DiceCitiesCardIds.TRAIN_STATION].cost > playerState.money || !hasRolled}>Unlock</Button> : ""}</div>
                </Col>
                <Col>
                    <div title={DiceCitiesCards[DiceCitiesCardIds.SHOPPING_MALL].text}><DiceCitiesCard card={DiceCitiesCards[DiceCitiesCardIds.SHOPPING_MALL]} disabled={!playerState.bonusDiningAndStore}></DiceCitiesCard> {myTurn && isMe && hasRolled && playerState && !playerState.bonusDiningAndStore ? <Button onClick={purchaseShoppingMall} disabled={DiceCitiesCards[DiceCitiesCardIds.SHOPPING_MALL].cost > playerState.money || !hasRolled}>Unlock</Button> : ""}</div>
                </Col>
                <Col>
                    <div title={DiceCitiesCards[DiceCitiesCardIds.AMUSEMENT_PARK].text}><DiceCitiesCard card={DiceCitiesCards[DiceCitiesCardIds.AMUSEMENT_PARK]} disabled={!playerState.oneReroll}></DiceCitiesCard> {myTurn && isMe && hasRolled && playerState && !playerState.oneReroll ? <Button onClick={purchaseAmusementPark} disabled={DiceCitiesCards[DiceCitiesCardIds.AMUSEMENT_PARK].cost > playerState.money || !hasRolled}>Unlock</Button> : ""}</div>
                </Col>
                <Col>
                    <div title={DiceCitiesCards[DiceCitiesCardIds.RADIO_TOWER].text}><DiceCitiesCard card={DiceCitiesCards[DiceCitiesCardIds.RADIO_TOWER]} disabled={!playerState.rerollDoubles}></DiceCitiesCard> {myTurn && isMe && hasRolled && playerState && !playerState.rerollDoubles ? <Button onClick={purchaseRadioTower} disabled={DiceCitiesCards[DiceCitiesCardIds.RADIO_TOWER].cost > playerState.money || !hasRolled}>Unlock</Button> : ""}</div>
                </Col>
            </Row>
            {isMe && currentTurn === user?.id ? (
                <>
                    <h3>Actions</h3>
                    <DiceCitiesPlayerActions playerState={playerState} hasRolled={hasRolled} hasReRolled={hasReRolled} awaitingSteal={awaitingTSSelection || awaitingBCSelection} submitCommand={submitCommand} />
                </>
            ) : null}
        </>
    );
}
