
import { ICommandResponse } from "@/app/api/game/command/route";
import { IDiceCitiesCard, IDiceCitiesGameDataResponse, IDiceCitiesGameStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCards } from "@/games/DiceCities/cards";
import { uuidString } from "@/utils/apiModels/GameDataApi";
import { DiceCitiesRequestCardPurchase, IGameCommand } from "@/utils/apiModels/GameLogic";
import { Button } from "react-bootstrap";

interface DiceCitiesBankProps {
    gameState: IDiceCitiesGameStateResponse,
    submitCommand: (command: IGameCommand, callback: (commandResponse: ICommandResponse) => void) => Promise<void>
}

export default function DiceCitiesBank({gameState, submitCommand}: DiceCitiesBankProps) {
    const handlePurchase = async (cardId: uuidString) => {
        const command = new DiceCitiesRequestCardPurchase();
        command.cardId = cardId;
        submitCommand(command, (commandResponse) => {
            console.log(commandResponse);
        });
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
                                <li key={cardCount.card.toString()}>{card.title} x{cardCount.amount} <Button onClick={() => {handlePurchase(card.cardId)}} disabled={!gameState.hasRolled || cardCount.amount === 0}>Purchase</Button></li>
                            )
                        })}
                    </ul>
                </li>
            </ul>
        </>
    );
}
