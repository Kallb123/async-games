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

// One line (or a few) of formatted, human-readable GameResult stats. Groups
// with a `username` are per-player (e.g. "coins earned"); groups without one
// are game-wide (e.g. "solved in 5 guesses"). Shared shape so any game's
// GameResult stats can be rendered by the same UI (popup + full result page).
export interface GameResultStatGroup {
    username?: string;
    lines: string[];
}

// A turn-by-turn line chart for the GameResult page: turn number on the
// x-axis, one line per series (typically per player). What's plotted varies
// by game (coins, score, territory...), so this shape only fixes the
// structure - one entry per turn, keyed by username - letting any game's
// GameResult stats power the same chart component.
export interface GameResultChart {
    title: string;
    yLabel: string;
    turns: Record<string, number>[];
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
