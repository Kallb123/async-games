import { uuidString } from "./GameDataApi";
import { serializable } from "./Serialisable";

export interface IGameCommand {
    id: uuidString;
    timestamp: string;
    gameId: uuidString;
    readonly className: string;

    toString: () => string;
}

@serializable
export class RequestDiceRoll implements IGameCommand {
    id: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    doubleDice: boolean = false;
    readonly className = "RequestDiceRoll";

    toString() {
        return `DiceRoll! Double? ${this.doubleDice ? "True" : "False"}`;
    }
}

@serializable
export class RequestCardPurchase implements IGameCommand {
    id: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    cardId: uuidString = "uuuid-uuid-uuid-uuid-uuid";
    readonly className = "RequestCardPurchase";

    toString() {
        return `CardPurchase! Card? ${this.cardId}`;
    }
}
