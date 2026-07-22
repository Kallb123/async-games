import type { IGameType } from "./gameCommand";

export type uuidString = `${string}-${string}-${string}-${string}-${string}`;

export interface IGameResponse {
    gameId: uuidString,
    gameType: string,
    friendlyName: string,
    usernameList: string[],
    turnTimer: string,
    currentTurn: string,
    currentTurnUsername: string,
    lastTurnTimestamp: string,
    url: string,
    complete: boolean,
    winner: string
}

export interface IGameDataResponse {
    gameType: IGameType,
    usernameList: string[],
    turnTimer: string,
    currentTurn: string,
    gameState: {
        turnOrder: string[],
        history: string[]
    },
    complete: boolean,
    winner: string
}
