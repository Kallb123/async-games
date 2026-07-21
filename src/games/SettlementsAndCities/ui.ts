import type { SAC_DevCard } from './board';

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
