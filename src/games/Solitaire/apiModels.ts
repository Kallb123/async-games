import { IGameDataResponse } from "@/utils/apiModels/GameDataApi";
import { ICard, Suit } from "@/utils/games/Cards";

export interface ISolitaireGameStateResponse {
    drawMode: 'DRAW_1' | 'DRAW_3';
    stockCount: number,
    waste: ICard[],
    foundations: Record<Suit, ICard[]>,
    tableau: ICard[][],
    score: number,
    moves: number,
    undoCount: number,
    stockRecycleCount: number,
    tableauCardsTurned: number,
    wasteToTableauCount: number,
    cardsToFoundationCount: number,
    foundationToTableauCount: number,
    startedAt: string,
    canUndo: boolean
}

export interface ISolitaireGameDataResponse extends IGameDataResponse {
    specificGameState: ISolitaireGameStateResponse
}
