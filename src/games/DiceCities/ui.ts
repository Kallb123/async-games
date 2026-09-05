// Pure presentation helpers for the Dice Cities in-game screens.
//
// Everything a component needs to *render* a card — its activation colour, its
// short yield label, the landmark ordering — lives here so the mapping is
// defined once and shared across the board and the market, rather than being
// re-derived (and drifting) in each component.

import { IDiceCitiesCard, IDiceCitiesPlayerStateResponse } from "@/games/DiceCities/apiModels";
import { DiceCitiesCardIds, DiceCitiesCards } from "@/games/DiceCities/cards";

/** When an establishment pays out, expressed as the three board colours. */
export type Activation = "any" | "you" | "steal";

export interface ActivationMeta {
    /** Swatch colour for the card's top border / legend dot. */
    color: string;
    /** Short legend word. */
    label: string;
}

// Blue / green / red follow the standard tableau-builder convention shown in
// the design: blue activates on anyone's roll, green only on your own, red
// takes coins from whoever rolled.
export const ACTIVATION_META: Record<Activation, ActivationMeta> = {
    any: { color: "#3498db", label: "any" },
    you: { color: "#2ecc71", label: "you" },
    steal: { color: "#e74c3c", label: "steal" },
};

/** Which of the three activation colours a card belongs to. */
export function activationFor(card: IDiceCitiesCard): Activation {
    if (card.stealRollerGain > 0 || card.stealAllGain > 0 || card.stealChosenGain > 0 || card.tradeCards) {
        return "steal";
    }
    if (card.onOwnTurn && card.onOponentsTurn) {
        return "any";
    }
    return "you";
}

/** A compact "what it pays" line, e.g. "+1", "take 2", "all 2", "+3 ea". */
export function yieldLabel(card: IDiceCitiesCard): string {
    if (card.sharedDieGain) return "+🎲";
    if (card.stealAllGain > 0) return `all ${card.stealAllGain}`;
    if (card.stealChosenGain > 0) return `take ${card.stealChosenGain}`;
    if (card.stealRollerGain > 0) return `take ${card.stealRollerGain}`;
    if (card.tradeCards) return "trade";
    if (card.gainMultiplier) return `+${card.gainMultiplier.amountPerType} ea`;
    if (card.bankGain > 0) return `+${card.bankGain}`;
    return "";
}

/** The numbers a card activates on, e.g. "5" or "9, 10". */
export function rollLabel(card: IDiceCitiesCard): string {
    return card.rollNumber.join(", ");
}

// Narrower than `keyof IDiceCitiesPlayerStateResponse` so LANDMARKS can also
// index the engine-side IDiceCitiesPlayerState (GameResult stats compute
// landmarksUnlocked from this same table) - both share these four boolean
// field names.
export type DiceCitiesLandmarkFlag = "doubleUnlocked" | "bonusDiningAndStore" | "oneReroll" | "rerollDoubles";

/** Every flag a landmark can light up, including the Docks' optional Harbour. */
export type DiceCitiesBuildFlag = DiceCitiesLandmarkFlag | "harbourUnlocked";

export interface DiceCitiesLandmarkEntry {
    cardId: string;
    flag: DiceCitiesBuildFlag;
}

/**
 * The four landmarks in cost order, each paired with the player-state flag that
 * records whether it's been built. Building all four wins the game.
 *
 * Mind the last two. Both flags are named for rolling again, which makes them
 * easy to transpose — and they were, until the market's Amusement Park row was
 * found sending the Radio Tower's command. `buildLandmark` in
 * `DiceCitiesLogic` decides the pairing and this table has to match it:
 *
 * - Amusement Park → `rerollDoubles`: roll doubles and the turn comes back to
 *   you. A whole further turn, not a re-roll of the dice you just threw, so
 *   the name is looser than it looks.
 * - Radio Tower → `oneReroll`: one re-roll a turn, discarding what the first
 *   throw paid.
 *
 * The names stay because they are persisted schema fields — a player who has
 * built the Amusement Park already has `rerollDoubles` stored against them, so
 * renaming means migrating every game in the database for no player benefit.
 * `DiceCitiesLogic.test.ts` holds the two tables together instead.
 */
export const LANDMARKS: { cardId: string; flag: DiceCitiesLandmarkFlag }[] = [
    { cardId: DiceCitiesCardIds.TRAIN_STATION, flag: "doubleUnlocked" },
    { cardId: DiceCitiesCardIds.SHOPPING_MALL, flag: "bonusDiningAndStore" },
    { cardId: DiceCitiesCardIds.AMUSEMENT_PARK, flag: "rerollDoubles" },
    { cardId: DiceCitiesCardIds.RADIO_TOWER, flag: "oneReroll" },
];

/**
 * Every landmark a city can build in this game: the win-condition four, plus
 * the Docks' Harbour, which is buildable at any time and never required to win.
 * The Harbour is the cheapest thing on the board, so it leads the track.
 */
export function buildableLandmarks(enabledDocks: boolean): DiceCitiesLandmarkEntry[] {
    return enabledDocks
        ? [{ cardId: DiceCitiesCardIds.HARBOUR, flag: "harbourUnlocked" }, ...LANDMARKS]
        : LANDMARKS;
}

/** How many of the four landmarks a player has built (0–4). */
export function landmarkCount(playerState: IDiceCitiesPlayerStateResponse): number {
    return LANDMARKS.filter((l) => playerState[l.flag]).length;
}

/** The card metadata for a landmark by its player-state flag. */
export function landmarkCard(flag: keyof IDiceCitiesPlayerStateResponse): IDiceCitiesCard {
    const entry = LANDMARKS.find((l) => l.flag === flag);
    return DiceCitiesCards[entry!.cardId];
}

/** Path to a card's illustration in /public. */
export function cardArt(card: IDiceCitiesCard): string {
    return `/art/dicecities/japanese/${card.art}`;
}
