import { ICommandResponse } from "@/app/api/game/command/route";
import { IDiceCitiesCard, IDiceCitiesCardCountResponse, IDiceCitiesGameDataResponse, IDiceCitiesGameStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCards } from "@/games/DiceCities/cards";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { DiceCitiesRequestCardPurchase, IGameCommand } from "@/utils/apiModels/GameLogic";
import { useUser } from "@clerk/nextjs";
import { Button } from "react-bootstrap";

interface DiceCitiesBankProps {
    gameState: IDiceCitiesGameStateResponse,
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>
}

export default function DiceCitiesBank({gameState, submitCommand}: DiceCitiesBankProps) {
    const { user, isLoaded } = useUser();
    
    const handlePurchase = async (cardId: uuidString) => {
        const command = new DiceCitiesRequestCardPurchase();
        command.cardId = cardId;
        submitCommand(command, (commandResponse) => {
            console.log(commandResponse);
        });
    }

    const currentUserState = () => {
        if (isLoaded && user) {
            const playerState = gameState.playerStates[user.id];
            return playerState;
        }
        return null;
    }

    const isDisabled = (card: IDiceCitiesCard, cardCount: IDiceCitiesCardCountResponse) => {
        if (!gameState.hasRolled || cardCount.amount === 0) {
            return true;
        }
        const userState = currentUserState();
        if (!userState) {
            return true;
        }
        if (card.cost > userState.money) {
            return true;
        }
        const currentOwnership = userState.cards.find(cc => cc.card == card.cardId)?.amount;
        if (currentOwnership && currentOwnership >= card.ownLimit) {
            return true;
        }
        return false;
    }

    return (
        <>
            <h2>Bank</h2>
            <ul>
                {/* <li>Money: ???</li> */}
                <li>
                    <ul>
                        {gameState && gameState.bankCards.map(cardCount => {
                            const card: IDiceCitiesCard = DiceCitiesCards[cardCount.card.toString()];
                            return (
                                <li key={cardCount.card.toString()} title={card.text}>{card.title} x{cardCount.amount} (Cost: {card.cost}) <Button onClick={() => {handlePurchase(card.cardId)}} disabled={isDisabled(card, cardCount)}>Purchase</Button></li>
                            )
                        })}
                    </ul>
                </li>
            </ul>
        </>
    );
}
