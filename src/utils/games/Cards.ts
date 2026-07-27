// Shared playing-card domain: types, deck construction/shuffling and small
// display helpers, reusable by any future card game (see AGENTS.md — build
// reusable components/utilities, not per-game copies). Parallels DiceRoll.ts:
// a small cross-game "randomness + domain facts" utility.

export type Suit = 'S' | 'H' | 'D' | 'C';

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

// rank/suit are optional because this same shape is used both for the full-
// fidelity server-side state and for the redacted wire DTO sent to the client
// (a face-down card ships as `{ faceUp: false }` with no rank/suit, so it
// can't be inspected). Rules/legal-move logic never needs a face-down card's
// identity, only that it's present, so one shape safely serves both.
export interface ICard {
    rank?: number; // 1 (Ace) - 13 (King)
    suit?: Suit;
    faceUp: boolean;
}

export function isRed(suit: Suit): boolean {
    return suit === 'H' || suit === 'D';
}

export function suitSymbol(suit: Suit): string {
    return { S: '♠', H: '♥', D: '♦', C: '♣' }[suit];
}

export function rankLabel(rank: number): string {
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return String(rank);
}

// Stable identity for a card, e.g. "1S" for the Ace of Spades.
export function cardId(card: { rank?: number; suit?: Suit }): string {
    return `${card.rank ?? '?'}${card.suit ?? '?'}`;
}

// A fresh, ordered 52-card deck, every card face-down.
export function buildStandardDeck(): ICard[] {
    const deck: ICard[] = [];
    for (const suit of SUITS) {
        for (let rank = 1; rank <= 13; rank++) {
            deck.push({ rank, suit, faceUp: false });
        }
    }
    return deck;
}

// Fisher-Yates shuffle, matching DiceRoll's Math.random-based approach.
export function shuffleDeck(deck: ICard[]): ICard[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
