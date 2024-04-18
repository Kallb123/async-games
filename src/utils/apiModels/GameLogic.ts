import { IDiceCitiesGameData } from "@/games/DiceCities/DiceCitiesModels";
import { IGameData } from "../mongodb/GameData";
import { uuidString } from "./GameDataApi";
import { serializable } from "./Serialisable";

export interface ICommandOutcome {
    validMove: boolean,
    turnOver: boolean
}

export interface IGameCommand {
    id: uuidString;
    timestamp: string;
    gameId: uuidString;
    readonly className: string;

    toString: () => string;
    Execute: (gameData: IGameData) => ICommandOutcome;
}

@serializable
export class DiceCitiesRequestDiceRoll implements IGameCommand {
    id: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    doubleDice: boolean = false;
    readonly className = "RequestDiceRoll";

    toString() {
        return `DiceRoll! Double? ${this.doubleDice ? "True" : "False"}`;
    }

    Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        return {
            turnOver: true,
            validMove: true
        };
    }
}

@serializable
export class DiceCitiesRequestCardPurchase implements IGameCommand {
    id: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    cardId: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    readonly className = "RequestCardPurchase";

    toString() {
        return `CardPurchase! Card? ${this.cardId}`;
    }

    Execute(gameData: IGameData) {
        const dcGameData = gameData as IDiceCitiesGameData;
        return {
            turnOver: true,
            validMove: true
        };
    }
}
