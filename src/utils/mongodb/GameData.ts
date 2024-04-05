export interface GameData {
    gameId: `${string}-${string}-${string}-${string}-${string}`,
    userIdList: string[],
    turnTimer: string,
    currentTurn: string
}

export interface GameResponse {
    gameId: `${string}-${string}-${string}-${string}-${string}`,
    usernameList: string[],
    turnTimer: string,
    currentTurn: string
}
