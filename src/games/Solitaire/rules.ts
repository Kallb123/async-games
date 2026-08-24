// Pure, isomorphic Klondike rules: legal-move computation and validation.
// Imported by SolitaireLogic.ts (server-side command validation, over the
// full-fidelity board) and by the board UI (client-side, over the redacted
// response DTO) — one source of truth for what a legal move is. Safe to share
// because these functions never need a face-down card's rank/suit, only
// whether it's present.
import { ICard, Suit, SUITS, isRed, rankLabel, suitSymbol } from "@/utils/games/Cards";

export type SolitaireZoneRef =
    | { zone: "waste" }
    | { zone: "tableau"; column: number }
    | { zone: "foundation"; suit: Suit };

export interface ISolitaireLegalMoveState {
    waste: ICard[];
    foundations: Record<Suit, ICard[]>;
    tableau: ICard[][];
    stockCount: number;
}

// The server's board keeps the whole stock pile while the client's DTO only
// carries a count, so this is the one projection that differs between them —
// `ISolitaireGameStateResponse` already satisfies ISolitaireLegalMoveState and
// can be passed straight to getLegalMoves/hasAnyLegalMove.
export function toLegalMoveState(state: { waste: ICard[]; foundations: Record<Suit, ICard[]>; tableau: ICard[][]; stock: ICard[] }): ISolitaireLegalMoveState {
    return { waste: state.waste, foundations: state.foundations, tableau: state.tableau, stockCount: state.stock.length };
}

export interface ISolitaireLegalMove {
    source: SolitaireZoneRef;
    count: number;
    destination: SolitaireZoneRef;
    label: string;
    reason: string;
    recommended: boolean;
}

export function canPlaceOnFoundation(card: ICard, pile: ICard[]): boolean {
    if (card.rank == null || card.suit == null) return false;
    if (pile.length === 0) return card.rank === 1;
    const top = pile[pile.length - 1];
    return top.suit === card.suit && top.rank === card.rank - 1;
}

export function canPlaceOnTableau(card: ICard, destTop: ICard | undefined): boolean {
    if (card.rank == null || card.suit == null) return false;
    if (!destTop) return card.rank === 13;
    if (destTop.rank == null || destTop.suit == null) return false;
    return isRed(destTop.suit) !== isRed(card.suit) && destTop.rank === card.rank + 1;
}

// True when `cards` (ordered top-of-group first, i.e. the card that would
// touch the destination, down to the bottommost/frontmost card) form a
// contiguous, face-up, descending, alternating-colour run.
export function isValidSequence(cards: ICard[]): boolean {
    if (cards.length === 0) return false;
    for (const c of cards) {
        if (!c.faceUp || c.rank == null || c.suit == null) return false;
    }
    for (let i = 1; i < cards.length; i++) {
        const prev = cards[i - 1];
        const cur = cards[i];
        if (isRed(prev.suit!) === isRed(cur.suit!)) return false;
        if (prev.rank! - cur.rank! !== 1) return false;
    }
    return true;
}

// Whether removing `count` cards from the end of `column` exposes a
// currently face-down card (i.e. this move will flip one over).
export function willExposeHiddenCard(column: ICard[], count: number): boolean {
    const remaining = column.length - count;
    return remaining > 0 && !column[remaining - 1].faceUp;
}

export function canDraw(stockCount: number, wasteCount: number): boolean {
    return stockCount > 0 || wasteCount > 0;
}

function tableauLabel(column: number, destTop: ICard | undefined): string {
    return destTop && destTop.rank != null && destTop.suit != null
        ? `Onto ${rankLabel(destTop.rank)}${suitSymbol(destTop.suit)} · column ${column + 1}`
        : `Onto empty column ${column + 1} (Kings only)`;
}

// Every legal move available from the current board, tagged with a human
// label and (at most one) `recommended` flag — powers both the tap-to-move
// destination sheet and the hint banner.
export function getLegalMoves(state: ISolitaireLegalMoveState): ISolitaireLegalMove[] {
    const moves: ISolitaireLegalMove[] = [];

    const push = (source: SolitaireZoneRef, count: number, destination: SolitaireZoneRef, label: string, reason: string) => {
        moves.push({ source, count, destination, label, reason, recommended: false });
    };

    // Waste top card → tableau / foundation.
    if (state.waste.length > 0) {
        const card = state.waste[state.waste.length - 1];
        state.tableau.forEach((column, i) => {
            const destTop = column[column.length - 1];
            if (canPlaceOnTableau(card, destTop)) {
                push({ zone: "waste" }, 1, { zone: "tableau", column: i }, tableauLabel(i, destTop), "From the waste pile");
            }
        });
        if (card.suit && canPlaceOnFoundation(card, state.foundations[card.suit])) {
            push({ zone: "waste" }, 1, { zone: "foundation", suit: card.suit }, `To ${suitSymbol(card.suit)} foundation`, "From the waste pile");
        }
    }

    // Tableau runs → other tableau columns / foundation (single card only).
    state.tableau.forEach((column, from) => {
        for (let index = 0; index < column.length; index++) {
            if (!column[index].faceUp) continue;
            const run = column.slice(index);
            if (!isValidSequence(run)) continue;
            const count = run.length;
            const mover = run[0];

            state.tableau.forEach((destColumn, to) => {
                if (to === from) return;
                const destTop = destColumn[destColumn.length - 1];
                if (!canPlaceOnTableau(mover, destTop)) return;
                // A King-headed run that already sits at the bottom of its
                // column has nothing underneath it to free, so shifting the
                // whole column into an empty one leaves an identical board:
                // it's not a move worth offering, and — because
                // hasAnyLegalMove counts these — it must not be what stops a
                // dead board from reading as stuck.
                if (!destTop && index === 0) return;
                const reason = willExposeHiddenCard(column, count) ? "Frees a face-down card" : `From column ${from + 1}`;
                push({ zone: "tableau", column: from }, count, { zone: "tableau", column: to }, tableauLabel(to, destTop), reason);
            });

            if (count === 1 && mover.suit && canPlaceOnFoundation(mover, state.foundations[mover.suit])) {
                push({ zone: "tableau", column: from }, 1, { zone: "foundation", suit: mover.suit }, `To ${suitSymbol(mover.suit)} foundation`, `From column ${from + 1}`);
            }
        }
    });

    // Foundation → tableau (optional reverse-move rule).
    for (const suit of SUITS) {
        const pile = state.foundations[suit];
        if (pile.length === 0) continue;
        const card = pile[pile.length - 1];
        state.tableau.forEach((column, i) => {
            const destTop = column[column.length - 1];
            if (canPlaceOnTableau(card, destTop)) {
                push({ zone: "foundation", suit }, 1, { zone: "tableau", column: i }, tableauLabel(i, destTop), `Pull back from the ${suitSymbol(suit)} foundation`);
            }
        });
    }

    // Sending a card home is never a bad move, so it always sorts first
    // (Array.prototype.sort is stable, so ties keep their original order).
    moves.sort((a, b) => (a.destination.zone === "foundation" ? 0 : 1) - (b.destination.zone === "foundation" ? 0 : 1));

    // Recommend: a foundation move beats freeing a hidden card beats any other reshuffle.
    let recommendedIndex = moves.findIndex((m) => m.destination.zone === "foundation");
    if (recommendedIndex === -1) recommendedIndex = moves.findIndex((m) => m.reason === "Frees a face-down card");
    if (recommendedIndex === -1 && moves.length > 0) recommendedIndex = 0;
    if (recommendedIndex >= 0) moves[recommendedIndex].recommended = true;

    return moves;
}

export function hasAnyLegalMove(state: ISolitaireLegalMoveState): boolean {
    return getLegalMoves(state).length > 0 || canDraw(state.stockCount, state.waste.length);
}

// Total cards currently home across all four foundations (0-52) — the win
// condition and the "N/52" telemetry both derive from this.
export function foundationCardCount(foundations: Record<Suit, ICard[]>): number {
    return SUITS.reduce((total, suit) => total + foundations[suit].length, 0);
}

// Auto-solve becomes available once every tableau card is face-up: with no
// hidden information left, the rest of the game can be played out mechanically.
export function hasHiddenTableauCards(tableau: ICard[][]): boolean {
    return tableau.some((column) => column.some((card) => !card.faceUp));
}

// Doc §5.1: "Time Penalty: -2 pts / 10s". Derived, not persisted — computed
// on demand from `startedAt` by both the server (GameResult stats) and the
// client (live stat strip / victory screen), so there's nothing to keep in
// sync via a background job.
export function computeTimePenalty(elapsedSeconds: number): number {
    return Math.floor(elapsedSeconds / 10) * 2;
}

// Final displayed score: the event-based accumulator minus the time penalty,
// clamped at 0 (Microsoft rules never show a negative score).
export function computeFinalScore(rawScore: number, elapsedSeconds: number): number {
    return Math.max(0, rawScore - computeTimePenalty(elapsedSeconds));
}

// "m:ss" duration, shared by the live stat strip, the victory screen and the
// GameResult formatter — one formatter, not three copies of the same math.
export function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
