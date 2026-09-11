import type { ISACRollChange, SAC_DevCard, SAC_Resource } from './board';
import { SAC_RESOURCES } from './board';

// ─── Development-card presentation metadata ────────────────────────────────────
// Shared between the in-game hand (board page) and the actions sheet so the icon,
// name and one-line blurb for each dev card are defined in exactly one place.
// See AGENTS.md — per-game presentation helpers live in games/<Game>/ui.ts.

export interface SACDevCardMeta {
    emoji: string;
    name: string;
    blurb: string;
    /** Progress/knight cards are actively played; Victory Points are passive. */
    playable: boolean;
}

export const SAC_DEV_CARD_META: Record<SAC_DevCard, SACDevCardMeta> = {
    knight:       { emoji: '⚔️', name: 'Knight',        blurb: 'Move the robber & steal · 3+ claims Largest Army', playable: true },
    roadBuilding: { emoji: '🛣️', name: 'Road Building',  blurb: 'Place 2 free roads',                              playable: true },
    yearOfPlenty: { emoji: '🌾', name: 'Year of Plenty', blurb: 'Take any 2 resources from the bank',              playable: true },
    monopoly:     { emoji: '🎩', name: 'Monopoly',       blurb: 'Every player hands you one resource type',        playable: true },
    victoryPoint: { emoji: '🏆', name: 'Victory Point',  blurb: 'Hidden +1 VP · revealed automatically to win',   playable: false },
};

// Display order for dev cards (playable cards first, hidden Victory Points last).
export const SAC_DEV_CARD_ORDER: SAC_DevCard[] = [
    'knight', 'roadBuilding', 'yearOfPlenty', 'monopoly', 'victoryPoint',
];

// Tapping the board sends a command, so the tapped spot needs to say "sent" the
// way a button does — the board paints a ghost piece on the spot of this kind
// that's in flight.
export type SACSpotKind = 'vertex' | 'edge' | 'hex';

// ─── Resources ────────────────────────────────────────────────────────────────
// The emoji each resource is drawn as — the board's legend and harbour labels,
// the hand, the build costs, the trade pickers and the roll payout all read this
// one table, where three screens each carried their own identical copy before.
// The order they're printed in is SAC_RESOURCES, over in board.ts: the rules
// depend on it too, so it can't live here.

export const SAC_RESOURCE_EMOJI: Record<SAC_Resource, string> = {
    lumber: '🪵', wool: '🐑', grain: '🌾', brick: '🧱', ore: '⛏️',
};

// ─── What a roll moved ────────────────────────────────────────────────────────

/**
 * One player's side of a roll, as a short label: `+2🪵 +1🌾` for terrain that
 * paid them, `−3 cards` for what a 7 took off them. Empty when the roll left
 * them alone, which is how `sacRollChangeParts` knows to leave them out.
 *
 * Discards are a count because that is all the state records — which cards a 7
 * took is hidden information (see ISACRollChange).
 */
export function sacRollChangeLabel(change: ISACRollChange): string {
    const parts = SAC_RESOURCES
        .filter(resource => (change.gained?.[resource] ?? 0) > 0)
        .map(resource => `+${change.gained[resource]}${SAC_RESOURCE_EMOJI[resource]}`);
    if (change.discarded > 0) parts.push(`−${change.discarded} card${change.discarded === 1 ? '' : 's'}`);
    return parts.join(' ');
}

/**
 * A roll's payout, per player: `["Bob +2🪵 +1🌾", "Alice +1⛏️"]`, naming every
 * player the roll touched and skipping the ones it didn't. Empty when the roll
 * moved nothing at all.
 *
 * `nameFor` is left to the caller because callers need different names for the
 * same userId — the live board says "You" for the viewer, the turn recap is read
 * by every player and so never can, and the history line written at roll time
 * has no names at all yet, so it hands back a `{{userId}}` token for the replay
 * engine to resolve later (see userToken/resolveTokens, utils/games/history.ts).
 * Dice Cities' coinChangeParts is the same helper for the same reason.
 */
export function sacRollChangeParts(
    changes: ISACRollChange[] | undefined,
    nameFor: (userId: string) => string,
): string[] {
    return (changes ?? [])
        .map(change => ({ change, label: sacRollChangeLabel(change) }))
        .filter(({ label }) => label !== '')
        .map(({ change, label }) => `${nameFor(change.userId)} ${label}`);
}
