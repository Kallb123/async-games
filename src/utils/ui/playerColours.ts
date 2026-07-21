// The shared per-player swatch palette. Players are coloured by their index in
// the game's user list, so a player keeps the same colour across the board, the
// scoreboard and the turn recap. Reuse this rather than redeclaring the array.
export const PLAYER_COLOURS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

// Colour for the player at a given index (wraps if there are more players than
// colours). Negative/unknown indices fall back to the first colour.
export function playerColour(index: number): string {
    if (index < 0) return PLAYER_COLOURS[0];
    return PLAYER_COLOURS[index % PLAYER_COLOURS.length];
}
