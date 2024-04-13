export type uuidString = `${string}-${string}-${string}-${string}-${string}`;

export interface IGameResponse {
    gameId: uuidString,
    gameType: string,
    friendlyName: string,
    usernameList: string[],
    turnTimer: string,
    currentTurn: string,
    url: string
}

export interface IGameDataResponse {
    gameId: uuidString,
    gameType: string,
    friendlyName: string,
    usernameList: string[],
    turnTimer: string,
    currentTurn: string,
    url: string,
    gameState: {
        turnOrder: string[],
        history: string[]
    }
}
