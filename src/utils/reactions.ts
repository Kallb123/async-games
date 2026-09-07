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
 * Picks one viewer's own reaction out of everyone's — what ReactionRow needs
 * to know whether *their* slot is the picker trigger or their sent pill.
 * Every other player's reaction is public and rendered as-is; this is only
 * ever used to find the one that gets the interactive treatment.
 */
export function viewerReaction(reactions: IReactionSummary[] | undefined, viewerId: string): string | null {
    return reactions?.find((r) => r.actorId === viewerId)?.reaction ?? null;
}

/**
 * Appends one reaction to a line's existing list — the optimistic-update half
 * of sending one, shared by every place that applies it to local state before
 * the server confirms it (the recap screen's own events, the live game's
 * history, both from the same tap — see useTurnRecap and useHistoryReactions).
 * `actorUsername` is left blank: the only pill this can ever affect before a
 * real refetch is the actor's own, which renders from `reacted` alone and
 * never reads the name (see ReactionRow / ReactionPicker's "You reacted…"
 * default).
 */
export function addReaction(reactions: IReactionSummary[] | undefined, actorId: string, reaction: string): IReactionSummary[] {
    return [...(reactions ?? []), { reaction, actorId, actorUsername: "" }];
}
