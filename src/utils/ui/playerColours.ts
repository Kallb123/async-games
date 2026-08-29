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

// The neutral ink for a swatch that belongs to nobody — a setup line nobody
// made, an unknown sender.
export const NEUTRAL_PLAYER_COLOUR = "var(--ag-ink-softer)";

// The colour for a player identified by their stable Clerk userId, following
// the game's userIdList order (parallel to usernameList, so a player keeps the
// same colour across the board, the scoreboard and the log). Prefer this over
// `playerColour(list.indexOf(id))`, which paints an unknown id as player one.
export function playerColourForId(userId: string | null | undefined, userIdList: string[]): string {
    const index = userId ? userIdList.indexOf(userId) : -1;
    return index >= 0 ? playerColour(index) : NEUTRAL_PLAYER_COLOUR;
}
