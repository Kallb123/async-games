// The fixed set of turn-recap reactions: a few canned phrases plus a row of
// emoji. Shared between the picker UI and the API route's server-side
// whitelist so the two can't drift apart.
export const REACTION_TEXT_OPTIONS = ["Phwoar!", "Nooo", "Nice!"] as const;
export const REACTION_EMOJI_OPTIONS = ["😬", "🤔", "🤩", "😱"] as const;
export const REACTION_OPTIONS = [...REACTION_TEXT_OPTIONS, ...REACTION_EMOJI_OPTIONS] as const;

export type ReactionValue = typeof REACTION_OPTIONS[number];

export function isValidReaction(value: string): value is ReactionValue {
    return (REACTION_OPTIONS as readonly string[]).includes(value);
}

// One player's reaction on one action — a command or recap event can now
// carry several of these, one per player who reacted to it, rather than a
// single shared reaction. Shared by the server (ReactionData's lookup) and
// the client (match history, the recap timeline) so both sides agree on the
// shape without either importing the Mongoose model.
export interface IReactionSummary {
    reaction: string;
    actorId: string;
    actorUsername: string;
}

/**
 * Picks one viewer's own reaction out of everyone's, for a screen like the
 * recap timeline that only ever shows *your* reaction on an event (never an
 * opponent's — see IRecapEventResponse). A small pure function rather than an
 * inline `.find` at the call site so the one line responsible for that
 * per-viewer redaction has a test of its own, not just the route around it.
 */
export function viewerReaction(reactions: IReactionSummary[] | undefined, viewerId: string): string | null {
    return reactions?.find((r) => r.actorId === viewerId)?.reaction ?? null;
}
