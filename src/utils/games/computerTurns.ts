import type { IGameData } from "../mongodb/GameData";
import type { IGameCommand } from "../apiModels/gameCommand";
import { createAdapterRegistry } from "./adapterRegistry";

// A turn the computer takes (docs/games/realm-arena-hold-out.md §3): Realm
// Arena's warbands in co-op. The game hands the turn to a seat of the
// computer's — `currentTurn` names it — and the player's request returns at
// once. The server then plays that seat's turn as a command of the game's own,
// built here by the game's adapter, recorded on `commandHistory` like any move
// so a replay plays it without asking the game to choose again
// (`playComputerTurns`, which the command route runs once the move is saved,
// and the turn-timer cron runs as a backstop).
//
// Pure, and browser-safe: a game's rules module registers its adapter as it
// loads, as it registers a dropout adapter (playerDropout.ts).

/**
 * The mark every computer's seat id starts with: `ai:0`, `ai:1`, …, which no
 * Clerk id can ever be. The one thing the game-agnostic engine knows of a
 * computer's seat, so the turn-timer sweep can tell one from a player's off
 * the projected `currentTurn` alone.
 */
export const COMPUTER_SEAT_PREFIX = "ai:";

/** Whether `seat` is one of the computer's rather than a player's. */
export const isComputerSeat = (seat: string | null | undefined): boolean => typeof seat === "string" && seat.startsWith(COMPUTER_SEAT_PREFIX);

/**
 * How long a computer's turn may stand before the turn-timer sweep plays it
 * itself (§3.2): the backstop for a runner that stopped, whatever the game's
 * turn timer. Never a timeout: a computer's turn is never ended for it.
 */
export const COMPUTER_TURN_STALE_MS = 2 * 60 * 1000;

export interface IComputerTurnAdapter {
    className: string; // gameType.className
    /**
     * The command that plays the turn of the computer's seat that holds
     * `currentTurn`, for the server to stamp and run — or null when the game
     * has no turn for it to play, which leaves the game as it is. Its
     * `senderId` is the seat.
     */
    buildCommand(gameData: IGameData): IGameCommand | null;
}

const adapters = createAdapterRegistry<IComputerTurnAdapter>();

export function registerComputerTurnAdapter(adapter: IComputerTurnAdapter): void {
    adapters.register(adapter);
}

export function getComputerTurnAdapter(className: string): IComputerTurnAdapter | undefined {
    return adapters.get(className);
}

/** Whether the turn is the computer's to play: a live game whose `currentTurn` is a computer's seat, in a game that can play it. */
export function isComputerTurn(gameData: Pick<IGameData, "complete" | "currentTurn" | "gameType">): boolean {
    return !gameData.complete && isComputerSeat(gameData.currentTurn) && adapters.has(gameData.gameType.className);
}
