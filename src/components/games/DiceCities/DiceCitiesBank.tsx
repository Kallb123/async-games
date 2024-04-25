import { ICommandResponse } from "@/app/api/game/command/route";
import { IDiceCitiesCard, IDiceCitiesCardCountResponse, IDiceCitiesGameDataResponse, IDiceCitiesGameStateResponse, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCards } from "@/games/DiceCities/cards";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { DiceCitiesRequestCardPurchase, IGameCommand } from "@/utils/apiModels/GameLogic";
import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { Button, Col, Row } from "react-bootstrap";
import DiceCitiesCard from "./DiceCitiesCard";
import DiceCitiesCardStack from "./DiceCitiesCardStack";

interface DiceCitiesBankProps {
    gameState: IDiceCitiesGameStateResponse,
    currentTurn: string,
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>
}

export default function DiceCitiesBank({gameState, currentTurn, submitCommand}: DiceCitiesBankProps) {
    const { user, isLoaded } = useUser();
    const [currentUserState, setCurrentUserState] = useState(null as IDiceCitiesPlayerStateResponse | null);

    useEffect(() => {
        if (isLoaded && user && gameState) {
            const playerState = gameState.playerStates[user.username || ""];
            setCurrentUserState(playerState);
        }
        window.addEventListener('TurnTaken', () => {
            console.log(`DiceCitiesBank message received: TurnTaken`);
        });
    }, [isLoaded, gameState, user]);
    
    const handlePurchase = async (cardId: uuidString) => {
        const command = new DiceCitiesRequestCardPurchase();
        command.cardId = cardId;
        submitCommand(command, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    const isDisabled = (card: IDiceCitiesCard, cardCount: IDiceCitiesCardCountResponse, userState: IDiceCitiesPlayerStateResponse | null) => {
        if (!gameState.hasRolled) {
            // console.log(`${card.title} disabled not rolled`);
            return true;
        }
        if (cardCount.amount === 0) {
            // console.log(`${card.title} disabled none left`);
            return true;
        }
        if (!userState) {
            // console.log(`${card.title} no userstate`);
            return true;
        }
        if (card.cost > userState.money) {
            // console.log(`${card.title} disabled cost too much`);
            return true;
        }
        const currentOwnership = userState.cards.find(cc => cc.card == card.cardId)?.amount;
        if (currentOwnership && currentOwnership >= card.ownLimit) {
            // console.log(`${card.title} disabled ownership limit`);
            return true;
        }
        // console.log(`${card.title} enabled`);
        return false;
    }

    return (
        <>
            <h2>Bank</h2>
            <h3>Money: Lots</h3>
            <h3>Cards</h3>
            <Row>
                {currentUserState && gameState && [...gameState.bankCards].sort((cc1, cc2) => DiceCitiesCards[cc1.card].rollNumber[0] - DiceCitiesCards[cc2.card].rollNumber[0]).map(cardCount => {
                    const card: IDiceCitiesCard = DiceCitiesCards[cardCount.card];
                    return (
                        <Col key={cardCount.card} title={card.text}><DiceCitiesCardStack card={card} amount={cardCount.amount} disabled={false}></DiceCitiesCardStack> {
                            isLoaded && user?.id === currentTurn && gameState.hasRolled ?
                                <Button onClick={() => {handlePurchase(card.cardId)}} disabled={isDisabled(card, cardCount, currentUserState)}>Purchase</Button>
                            : ""
                        }</Col>
                    )
                })}
            </Row>
        </>
    );
}
