import { IGameDataResponse } from "@/utils/apiModels/GameDataApi";

export interface ISnakesAndLaddersPlayerStateResponse {
    username: string,
    userId: string,
    position: number
}

export interface ISnakesAndLaddersGameStateResponse {
    playerStates: { [key: string]: ISnakesAndLaddersPlayerStateResponse },
    hasRolled: boolean
}

export interface ISnakesAndLaddersGameDataResponse extends IGameDataResponse {
    specificGameState: ISnakesAndLaddersGameStateResponse
}
