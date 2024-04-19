import { ICommandResponse } from "@/app/api/game/command/route";
import { IDiceCitiesCard, IDiceCitiesCardCountResponse, IDiceCitiesGameDataResponse, IDiceCitiesGameStateResponse, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCards } from "@/games/DiceCities/cards";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { DiceCitiesRequestCardPurchase, IGameCommand } from "@/utils/apiModels/GameLogic";
import { useUser } from "@clerk/nextjs";
import { UserResource } from "@clerk/types";
import { useEffect, useState } from "react";
import { Button } from "react-bootstrap";

interface DiceCitiesBankProps {
    gameState: IDiceCitiesGameStateResponse,
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>
}

export default function DiceCitiesBank({gameState, submitCommand}: DiceCitiesBankProps) {
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
            <ul>
                {/* <li>Money: ???</li> */}
                <li>
                    <ul>
                        {currentUserState && gameState && gameState.bankCards.map(cardCount => {
                            const card: IDiceCitiesCard = DiceCitiesCards[cardCount.card.toString()];
                            return (
                                <li key={cardCount.card.toString()} title={card.text}>{card.title} x{cardCount.amount} (Cost: {card.cost}) <Button onClick={() => {handlePurchase(card.cardId)}} disabled={isDisabled(card, cardCount, currentUserState)}>Purchase</Button></li>
                            )
                        })}
                    </ul>
                </li>
            </ul>
        </>
    );
}
