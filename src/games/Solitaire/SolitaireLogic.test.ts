import { describe, expect, it } from "vitest";
import { SolitaireDraw, SolitaireMoveCard, SolitaireUndo, SolitaireGameType } from "./SolitaireLogic";
import { buildInitialSolitaireState, ISolitaireGameData, ISolitaireGameState } from "./SolitaireModels";
import { canPlaceOnFoundation, canPlaceOnTableau, getLegalMoves, hasAnyLegalMove } from "./rules";
import { ICard, SUITS } from "@/utils/games/Cards";

// ─── Minimal in-memory game harness ───────────────────────────────────────────
// markModified is a Mongoose Document method the real command route relies on
// (see markDirty in SolitaireLogic.ts); the plain object here has none, and
// markDirty is written to no-op safely when it's absent.
function makeGame(state: ISolitaireGameState): ISolitaireGameData {
    return {
        gameId: "g",
        currentTurn: "u1",
        userIdList: ["u1"],
        gameState: { turnOrder: ["u1"], history: [], commandHistory: [] },
        specificGameState: state,
        complete: false,
        winner: "",
    } as unknown as ISolitaireGameData;
}

function cmd<T extends { senderId: string; senderUsername: string }>(c: T): T {
    c.senderId = "u1";
    c.senderUsername = "Alice";
    return c;
}

function countAllCards(state: ISolitaireGameState): number {
    const foundationCount = SUITS.reduce((n, s) => n + state.foundations[s].length, 0);
    const tableauCount = state.tableau.reduce((n, col) => n + col.length, 0);
    return state.stock.length + state.waste.length + foundationCount + tableauCount;
}

describe("rules", () => {
    it("only an Ace can start a foundation", () => {
        const ace: ICard = { rank: 1, suit: "S", faceUp: true };
        const two: ICard = { rank: 2, suit: "S", faceUp: true };
        expect(canPlaceOnFoundation(ace, [])).toBe(true);
        expect(canPlaceOnFoundation(two, [])).toBe(false);
        expect(canPlaceOnFoundation(two, [ace])).toBe(true);
    });

    it("tableau builds down in alternating colours", () => {
        const blackSeven: ICard = { rank: 7, suit: "S", faceUp: true };
        const redSix: ICard = { rank: 6, suit: "H", faceUp: true };
        const blackSix: ICard = { rank: 6, suit: "C", faceUp: true };
        expect(canPlaceOnTableau(redSix, blackSeven)).toBe(true);
        expect(canPlaceOnTableau(blackSix, blackSeven)).toBe(false);
    });

    it("only a King may go onto an empty column", () => {
        const king: ICard = { rank: 13, suit: "S", faceUp: true };
        const queen: ICard = { rank: 12, suit: "S", faceUp: true };
        expect(canPlaceOnTableau(king, undefined)).toBe(true);
        expect(canPlaceOnTableau(queen, undefined)).toBe(false);
    });
});

describe("buildInitialSolitaireState", () => {
    it("deals 52 cards: 7 tableau columns (n cards, last face-up) + 24-card stock", () => {
        const state = buildInitialSolitaireState('DRAW_1');
        expect(countAllCards(state)).toBe(52);
        expect(state.stock.length).toBe(24);
        expect(state.stock.every(c => !c.faceUp)).toBe(true);
        state.tableau.forEach((column, i) => {
            expect(column.length).toBe(i + 1);
            column.forEach((card, j) => expect(card.faceUp).toBe(j === column.length - 1));
        });
    });
});

describe("SolitaireDraw", () => {
    it("draws one card to the waste in DRAW_1 mode", async () => {
        const state = buildInitialSolitaireState('DRAW_1');
        const stockBefore = state.stock.length;
        const game = makeGame(state);
        const outcome = await cmd(new SolitaireDraw()).Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(state.stock.length).toBe(stockBefore - 1);
        expect(state.waste.length).toBe(1);
        expect(state.waste[0].faceUp).toBe(true);
        expect(state.moves).toBe(1);
    });

    it("draws up to three cards in DRAW_3 mode", async () => {
        const state = buildInitialSolitaireState('DRAW_3');
        const game = makeGame(state);
        await cmd(new SolitaireDraw()).Execute(game);
        expect(state.waste.length).toBe(3);
    });

    it("recycles the waste into the stock once it's exhausted, free for the first two times", async () => {
        const state = buildInitialSolitaireState('DRAW_1');
        state.stock = [];
        state.waste = [{ rank: 1, suit: 'S', faceUp: true }, { rank: 2, suit: 'S', faceUp: true }];
        const game = makeGame(state);
        const outcome = await cmd(new SolitaireDraw()).Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(state.waste.length).toBe(0);
        expect(state.stock.length).toBe(2);
        expect(state.stock.every(c => !c.faceUp)).toBe(true);
        // Order is preserved (reversed), so the next draw resurfaces the same top card.
        expect(state.stock[state.stock.length - 1]).toMatchObject({ rank: 1, suit: 'S' });
        expect(state.stockRecycleCount).toBe(1);
        expect(state.score).toBe(0); // first two recycles are free
    });

    it("penalises the 3rd+ recycle by -20", async () => {
        const state = buildInitialSolitaireState('DRAW_1');
        state.stockRecycleCount = 2;
        state.stock = [];
        state.waste = [{ rank: 1, suit: 'S', faceUp: true }];
        const game = makeGame(state);
        await cmd(new SolitaireDraw()).Execute(game);
        expect(state.stockRecycleCount).toBe(3);
        expect(state.score).toBe(-20);
    });

    it("is an invalid move when both stock and waste are empty", async () => {
        const state = buildInitialSolitaireState('DRAW_1');
        state.stock = [];
        state.waste = [];
        const outcome = await cmd(new SolitaireDraw()).Execute(makeGame(state));
        expect(outcome.validMove).toBe(false);
    });
});

describe("SolitaireMoveCard", () => {
    function baseState(): ISolitaireGameState {
        const state = buildInitialSolitaireState('DRAW_1');
        state.stock = [];
        state.waste = [];
        state.tableau = [[], [], [], [], [], [], []];
        state.foundations = { S: [], H: [], D: [], C: [] };
        return state;
    }

    it("moves the waste's top card to its foundation and scores +10", async () => {
        const state = baseState();
        state.waste = [{ rank: 1, suit: 'S', faceUp: true }];
        const game = makeGame(state);
        const move = cmd(new SolitaireMoveCard());
        move.source = { zone: 'waste' };
        move.destination = { zone: 'foundation', suit: 'S' };
        move.count = 1;
        const outcome = await move.Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(state.foundations.S).toEqual([{ rank: 1, suit: 'S', faceUp: true }]);
        expect(state.waste.length).toBe(0);
        expect(state.score).toBe(10);
        expect(state.cardsToFoundationCount).toBe(1);
    });

    it("rejects an illegal foundation placement", async () => {
        const state = baseState();
        state.waste = [{ rank: 2, suit: 'S', faceUp: true }]; // needs an Ace first
        const game = makeGame(state);
        const move = cmd(new SolitaireMoveCard());
        move.source = { zone: 'waste' };
        move.destination = { zone: 'foundation', suit: 'S' };
        move.count = 1;
        const outcome = await move.Execute(game);
        expect(outcome.validMove).toBe(false);
        expect(state.waste.length).toBe(1); // unchanged
    });

    it("flips the newly exposed tableau card and scores the +5 flip bonus", async () => {
        const state = baseState();
        state.tableau[0] = [
            { rank: 9, suit: 'D', faceUp: false },
            { rank: 6, suit: 'H', faceUp: true },
        ];
        state.tableau[1] = [{ rank: 7, suit: 'S', faceUp: true }];
        const game = makeGame(state);
        const move = cmd(new SolitaireMoveCard());
        move.source = { zone: 'tableau', column: 0 };
        move.destination = { zone: 'tableau', column: 1 };
        move.count = 1;
        const outcome = await move.Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(state.tableau[0]).toEqual([{ rank: 9, suit: 'D', faceUp: true }]);
        expect(state.tableau[1].length).toBe(2);
        expect(state.tableauCardsTurned).toBe(1);
        expect(state.score).toBe(5);
    });

    it("moves a whole valid run together", async () => {
        const state = baseState();
        state.tableau[0] = [
            { rank: 9, suit: 'S', faceUp: true },
            { rank: 8, suit: 'H', faceUp: true },
            { rank: 7, suit: 'C', faceUp: true },
        ];
        state.tableau[1] = [{ rank: 9, suit: 'C', faceUp: true }]; // black 9 accepts the red 8 on top
        const game = makeGame(state);
        const move = cmd(new SolitaireMoveCard());
        move.source = { zone: 'tableau', column: 0 };
        move.destination = { zone: 'tableau', column: 1 };
        move.count = 2; // 8H, 7C
        const outcome = await move.Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(state.tableau[0]).toEqual([{ rank: 9, suit: 'S', faceUp: true }]);
        expect(state.tableau[1].map(c => c.rank)).toEqual([9, 8, 7]);
    });

    it("only a single card can reverse-move off a foundation, scoring -15", async () => {
        const state = baseState();
        state.foundations.S = [{ rank: 1, suit: 'S', faceUp: true }, { rank: 2, suit: 'S', faceUp: true }];
        state.tableau[0] = [{ rank: 3, suit: 'H', faceUp: true }];
        const game = makeGame(state);
        const move = cmd(new SolitaireMoveCard());
        move.source = { zone: 'foundation', suit: 'S' };
        move.destination = { zone: 'tableau', column: 0 };
        move.count = 1;
        const outcome = await move.Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(state.foundations.S).toEqual([{ rank: 1, suit: 'S', faceUp: true }]);
        expect(state.tableau[0].map(c => c.rank)).toEqual([3, 2]);
        expect(state.score).toBe(-15);
        expect(state.foundationToTableauCount).toBe(1);
    });

    it("rejects foundation-to-foundation as illegal", async () => {
        const state = baseState();
        state.foundations.S = [{ rank: 1, suit: 'S', faceUp: true }];
        const game = makeGame(state);
        const move = cmd(new SolitaireMoveCard());
        move.source = { zone: 'foundation', suit: 'S' };
        move.destination = { zone: 'foundation', suit: 'H' };
        move.count = 1;
        const outcome = await move.Execute(game);
        expect(outcome.validMove).toBe(false);
    });
});

describe("SolitaireUndo", () => {
    it("reverts the board and score, and increments undoCount", async () => {
        const state = buildInitialSolitaireState('DRAW_1');
        const game = makeGame(state);
        const before = { score: state.score, waste: state.waste.length, stock: state.stock.length };

        await cmd(new SolitaireDraw()).Execute(game);
        expect(state.waste.length).toBe(before.waste + 1);

        const outcome = await cmd(new SolitaireUndo()).Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(state.waste.length).toBe(before.waste);
        expect(state.stock.length).toBe(before.stock);
        expect(state.score).toBe(before.score);
        expect(state.undoCount).toBe(1);
    });

    it("is an invalid move when there's nothing to undo", async () => {
        const state = buildInitialSolitaireState('DRAW_1');
        const outcome = await cmd(new SolitaireUndo()).Execute(makeGame(state));
        expect(outcome.validMove).toBe(false);
    });
});

describe("SolitaireGameType", () => {
    it("declares the game over and sets the winner once all 52 cards are home", () => {
        const state = buildInitialSolitaireState('DRAW_1');
        state.stock = [];
        state.waste = [];
        state.tableau = [[], [], [], [], [], [], []];
        for (const suit of SUITS) {
            state.foundations[suit] = Array.from({ length: 13 }, (_, i) => ({ rank: i + 1, suit, faceUp: true }));
        }
        const game = makeGame(state);
        const gameType = new SolitaireGameType();
        expect(gameType.CheckGameOver(game)).toBe(true);
        expect(game.complete).toBe(true);
        expect(game.winner).toBe("u1");
    });

    it("is not over with fewer than 52 cards home", () => {
        const state = buildInitialSolitaireState('DRAW_1');
        const gameType = new SolitaireGameType();
        expect(gameType.CheckGameOver(makeGame(state))).toBe(false);
    });
});

describe("full-game simulation", () => {
    it("auto-plays a game to completion or a clean stalemate without ever losing or duplicating a card", async () => {
        const state = buildInitialSolitaireState('DRAW_1');
        const game = makeGame(state);
        const gameType = new SolitaireGameType();

        for (let turn = 0; turn < 500 && !game.complete; turn++) {
            expect(countAllCards(state)).toBe(52);

            const legal = getLegalMoves({ waste: state.waste, foundations: state.foundations, tableau: state.tableau, stockCount: state.stock.length });
            const best = legal.find(m => m.recommended) ?? legal[0];

            if (best) {
                const move = cmd(new SolitaireMoveCard());
                move.source = best.source;
                move.destination = best.destination;
                move.count = best.count;
                const outcome = await move.Execute(game);
                expect(outcome.validMove).toBe(true);
            } else if (state.stock.length > 0 || state.waste.length > 0) {
                const outcome = await cmd(new SolitaireDraw()).Execute(game);
                expect(outcome.validMove).toBe(true);
            } else {
                // Genuinely stuck: no legal move and nothing left to draw/recycle.
                expect(hasAnyLegalMove({ waste: state.waste, foundations: state.foundations, tableau: state.tableau, stockCount: state.stock.length })).toBe(false);
                break;
            }

            if (gameType.CheckGameOver(game)) {
                break;
            }
        }

        expect(countAllCards(state)).toBe(52);
    });
});
