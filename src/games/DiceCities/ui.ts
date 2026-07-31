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

// The rollNumber data uses floats like 11.12 to mean "11 or 12"; render those
// as a clean "11-12" range and plain integers as-is.
export function rollLabel(card: IDiceCitiesCard): string {
    return card.rollNumber
        .map((n) => (Number.isInteger(n) ? String(n) : String(n).replace(".", "-")))
        .join(", ");
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
 */
export const LANDMARKS: { cardId: string; flag: DiceCitiesLandmarkFlag }[] = [
    { cardId: DiceCitiesCardIds.TRAIN_STATION, flag: "doubleUnlocked" },
    { cardId: DiceCitiesCardIds.SHOPPING_MALL, flag: "bonusDiningAndStore" },
    { cardId: DiceCitiesCardIds.AMUSEMENT_PARK, flag: "oneReroll" },
    { cardId: DiceCitiesCardIds.RADIO_TOWER, flag: "rerollDoubles" },
];

/** The Docks' fifth landmark — buildable at any time, never required to win. */
export const HARBOUR_LANDMARK: DiceCitiesLandmarkEntry = {
    cardId: DiceCitiesCardIds.HARBOUR,
    flag: "harbourUnlocked",
};

/**
 * Every landmark a city can build in this game: the win-condition four, plus
 * the Harbour when the Docks is switched on. The cheapest thing on the board
 * goes first, so it leads the track.
 */
export function buildableLandmarks(enabledDocks: boolean): DiceCitiesLandmarkEntry[] {
    return enabledDocks ? [HARBOUR_LANDMARK, ...LANDMARKS] : LANDMARKS;
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
