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
