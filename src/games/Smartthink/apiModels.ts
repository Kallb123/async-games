import type { IGameDataResponse } from "@/utils/apiModels/GameDataApi";

export interface ISmartthinkGuessRowResponse {
    guess: number[];
    black: number;
    white: number;
}

export interface ISmartthinkPlayerResponse {
    userId: string;
    username: string;
    role: 'Codemaker' | 'Codebreaker';
}

export interface ISmartthinkGameStateResponse {
    secretCodeSet: boolean;
    codeSetterId: string;
    codeSetterUsername: string;
    codeBreakerId: string;
    codeBreakerUsername: string;
    guessRows: ISmartthinkGuessRowResponse[];
    maxGuesses: number;
    remainingGuesses: number;
    players: ISmartthinkPlayerResponse[];
}

export interface ISmartthinkGameDataResponse extends IGameDataResponse {
    specificGameState: ISmartthinkGameStateResponse;
}
