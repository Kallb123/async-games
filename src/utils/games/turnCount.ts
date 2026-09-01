import { IGameCommand } from "../apiModels/gameCommand";

/**
 * How many turns a game's command history represents.
 *
 * `commandHistory.length` counts *commands*, which is not the same as turns: a
 * single turn is often several commands (Settlements & Cities rolls the dice,
 * builds, builds again, then ends the turn — four commands, one turn). Reporting
 * the command count as a turn count therefore over-states how long a game ran,
 * by more the chattier the game.
 *
 * Every command is issued by whoever's turn it was — /api/game/command rejects a
 * command whose `senderId` isn't the current player — and the turn only passes
 * to someone else once a command reports `turnOver`. So a turn is a maximal run
 * of consecutive commands by the same player, and counting those runs collapses
 * each multi-command turn back to the one turn it was.
 *
 * A solo game whose turn never passes (Solitaire) is a single unbroken run —
 * one turn — which is exactly what its never-changing `currentTurn` makes it.
 */
export function countTurns(commandHistory: readonly IGameCommand[]): number {
    let turns = 0;
    let previousSenderId: string | undefined;
    for (const command of commandHistory) {
        const senderId = command?.senderId;
        if (senderId !== previousSenderId) {
            turns++;
        }
        previousSenderId = senderId;
    }
    return turns;
}
