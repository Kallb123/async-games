import type { ISolitaireGameData, ISolitaireGameState, ISolitaireUndoSnapshot } from "@/games/Solitaire/SolitaireModels";
import type { IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import { ICard, rankLabel, suitSymbol } from "@/utils/games/Cards";
import {
    canDraw,
    canPlaceOnFoundation,
    canPlaceOnTableau,
    foundationCardCount,
    getLegalMoves,
    hasHiddenTableauCards,
    isValidSequence,
    SolitaireZoneRef,
    toLegalMoveState,
} from "@/games/Solitaire/rules";

// Standard/Microsoft scoring rules (docs/games/solitaire.md §5.1).
const WASTE_TO_TABLEAU = 5;
const WASTE_TO_FOUNDATION = 10;
const TABLEAU_TO_FOUNDATION = 10;
const TURN_OVER_TABLEAU = 5;
const FOUNDATION_TO_TABLEAU = -15;
const STOCK_RECYCLE_PENALTY = -20;
// "Stock Recycle (after 3): -20" - the first two recycles are free.
const STOCK_RECYCLE_FREE_COUNT = 2;

@serializable
export class SolitaireGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "Solitaire";
    friendlyName: string = "Solitaire";
    icon: string = "";
    url: string = "solitaire";
    readonly className: string = "SolitaireGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome) {
        // Solo play: there is only ever one player, so the turn never advances.
    }

    CheckGameOver(gameData: IGameData) {
        const state = (gameData as ISolitaireGameData).specificGameState;
        if (foundationCardCount(state.foundations) === 52) {
            gameData.complete = true;
            gameData.winner = gameData.currentTurn;
            gameData.currentTurn = "";
            return true;
        }
        return false;
    }
}

// Mongoose doesn't deep-track mutations inside Schema.Types.Mixed fields (only
// top-level reassignment), so every command must explicitly flag the whole
// specificGameState subtree dirty before the route's gameData.save() - same
// reason the command route itself calls markModified for commandHistory.
function markDirty(gameData: IGameData) {
    (gameData as unknown as Partial<IGameDataDocument>).markModified?.('specificGameState');
}

// Deep-clones the board-relevant (undoable) fields for the undo stack.
function snapshotOf(state: ISolitaireGameState): ISolitaireUndoSnapshot {
    return {
        stock: state.stock.map(c => ({ ...c })),
        waste: state.waste.map(c => ({ ...c })),
        foundations: {
            S: state.foundations.S.map(c => ({ ...c })),
            H: state.foundations.H.map(c => ({ ...c })),
            D: state.foundations.D.map(c => ({ ...c })),
            C: state.foundations.C.map(c => ({ ...c })),
        },
        tableau: state.tableau.map(column => column.map(c => ({ ...c }))),
        score: state.score,
        moves: state.moves,
        tableauCardsTurned: state.tableauCardsTurned,
        stockRecycleCount: state.stockRecycleCount,
        wasteToTableauCount: state.wasteToTableauCount,
        cardsToFoundationCount: state.cardsToFoundationCount,
        foundationToTableauCount: state.foundationToTableauCount,
    };
}

const INVALID_DRAW: ICommandOutcome = { turnOver: false, validMove: false };

@serializable
export class SolitaireDraw implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "SolitaireDraw";

    myString() {
        return `Solitaire Draw!`;
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const state = (gameData as ISolitaireGameData).specificGameState;

        if (state.stock.length === 0 && state.waste.length === 0) {
            return INVALID_DRAW;
        }

        state.undoStack.push(snapshotOf(state));

        if (state.stock.length > 0) {
            const drawCount = state.drawMode === 'DRAW_3' ? 3 : 1;
            const n = Math.min(drawCount, state.stock.length);
            const drawn = state.stock.splice(state.stock.length - n, n).map(card => ({ ...card, faceUp: true }));
            state.waste.push(...drawn);
            state.moves++;
            gameData.gameState.history.unshift(`${this.senderUsername} drew ${n === 1 ? 'a card' : `${n} cards`} from the stock`);
        } else {
            // Recycle: the whole waste pile is picked up and turned over to
            // become the new stock, preserving draw order (doc §4.3).
            state.stock = state.waste.slice().reverse().map(card => ({ ...card, faceUp: false }));
            state.waste = [];
            state.stockRecycleCount++;
            state.moves++;
            if (state.stockRecycleCount > STOCK_RECYCLE_FREE_COUNT) {
                state.score += STOCK_RECYCLE_PENALTY;
            }
            gameData.gameState.history.unshift(`${this.senderUsername} recycled the waste pile back into the stock`);
        }

        markDirty(gameData);
        return { turnOver: false, validMove: true };
    }

    Undo(gameData: IGameData) {
        console.error("Command Undo not implemented yet");
    }
}

export interface ISolitaireMoveOutcome extends ICommandOutcome {
    scoreDelta: number;
}

const INVALID_MOVE: ISolitaireMoveOutcome = { turnOver: false, validMove: false, scoreDelta: 0 };

@serializable
export class SolitaireMoveCard implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "SolitaireMoveCard";

    source: SolitaireZoneRef = { zone: 'waste' };
    destination: SolitaireZoneRef = { zone: 'waste' };
    // Number of cards moved together, counted from the frontmost card back
    // (only >1 for a tableau→tableau run move).
    count: number = 1;

    myString() {
        return `Solitaire MoveCard!`;
    }

    async Execute(gameData: IGameData): Promise<ISolitaireMoveOutcome> {
        const state = (gameData as ISolitaireGameData).specificGameState;

        // Appendix §8: Foundation only ever legally moves to Tableau.
        if (this.source.zone === 'foundation' && this.destination.zone !== 'tableau') {
            return INVALID_MOVE;
        }
        if (this.source.zone === 'tableau' && this.destination.zone === 'tableau' && this.source.column === this.destination.column) {
            return INVALID_MOVE;
        }

        let run: ICard[];
        if (this.source.zone === 'waste') {
            if (this.count !== 1 || state.waste.length === 0) return INVALID_MOVE;
            run = [state.waste[state.waste.length - 1]];
        } else if (this.source.zone === 'tableau') {
            const column = state.tableau[this.source.column];
            if (!column || this.count < 1 || this.count > column.length) return INVALID_MOVE;
            run = column.slice(column.length - this.count);
            if (!isValidSequence(run)) return INVALID_MOVE;
        } else {
            const pile = state.foundations[this.source.suit];
            if (this.count !== 1 || pile.length === 0) return INVALID_MOVE;
            run = [pile[pile.length - 1]];
        }

        const mover = run[0];
        if (mover.rank == null || mover.suit == null) return INVALID_MOVE;

        if (this.destination.zone === 'tableau') {
            const destColumn = state.tableau[this.destination.column];
            if (!destColumn || !canPlaceOnTableau(mover, destColumn[destColumn.length - 1])) return INVALID_MOVE;
        } else if (this.destination.zone === 'foundation') {
            if (this.count !== 1 || mover.suit !== this.destination.suit) return INVALID_MOVE;
            if (!canPlaceOnFoundation(mover, state.foundations[this.destination.suit])) return INVALID_MOVE;
        } else {
            return INVALID_MOVE; // waste is never a legal destination
        }

        // Every check passed - snapshot for undo, then mutate.
        state.undoStack.push(snapshotOf(state));

        if (this.source.zone === 'waste') {
            state.waste.pop();
        } else if (this.source.zone === 'tableau') {
            const column = state.tableau[this.source.column];
            column.splice(column.length - this.count, this.count);
            if (column.length > 0 && !column[column.length - 1].faceUp) {
                column[column.length - 1].faceUp = true;
                state.tableauCardsTurned++;
                state.score += TURN_OVER_TABLEAU;
            }
        } else {
            state.foundations[this.source.suit].pop();
        }

        let scoreDelta = 0;
        if (this.destination.zone === 'tableau') {
            state.tableau[this.destination.column].push(...run);
            if (this.source.zone === 'waste') {
                scoreDelta = WASTE_TO_TABLEAU;
                state.wasteToTableauCount++;
            } else if (this.source.zone === 'foundation') {
                scoreDelta = FOUNDATION_TO_TABLEAU;
                state.foundationToTableauCount++;
            }
            // tableau -> tableau reshuffles earn nothing beyond any flip above.
        } else if (this.destination.zone === 'foundation') {
            state.foundations[this.destination.suit].push(mover);
            scoreDelta = this.source.zone === 'waste' ? WASTE_TO_FOUNDATION : TABLEAU_TO_FOUNDATION;
            state.cardsToFoundationCount++;
        }
        state.score += scoreDelta;
        state.moves++;

        const destLabel = this.destination.zone === 'foundation'
            ? `to the ${suitSymbol(this.destination.suit)} foundation`
            : `to column ${this.destination.column + 1}`;
        gameData.gameState.history.unshift(
            `${this.senderUsername} moved ${rankLabel(mover.rank)}${suitSymbol(mover.suit)}${run.length > 1 ? ` +${run.length - 1}` : ''} ${destLabel}`
        );

        markDirty(gameData);
        return { turnOver: false, validMove: true, scoreDelta };
    }

    Undo(gameData: IGameData) {
        console.error("Command Undo not implemented yet");
    }
}

@serializable
export class SolitaireUndo implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "SolitaireUndo";

    myString() {
        return `Solitaire Undo!`;
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const state = (gameData as ISolitaireGameData).specificGameState;
        const snapshot = state.undoStack.pop();
        if (!snapshot) {
            return INVALID_DRAW;
        }

        state.stock = snapshot.stock;
        state.waste = snapshot.waste;
        state.foundations = snapshot.foundations;
        state.tableau = snapshot.tableau;
        state.score = snapshot.score;
        state.moves = snapshot.moves;
        state.tableauCardsTurned = snapshot.tableauCardsTurned;
        state.stockRecycleCount = snapshot.stockRecycleCount;
        state.wasteToTableauCount = snapshot.wasteToTableauCount;
        state.cardsToFoundationCount = snapshot.cardsToFoundationCount;
        state.foundationToTableauCount = snapshot.foundationToTableauCount;
        state.undoCount++;

        gameData.gameState.history.unshift(`${this.senderUsername} undid their last move`);

        markDirty(gameData);
        return { turnOver: false, validMove: true };
    }

    Undo(gameData: IGameData) {
        console.error("Command Undo not implemented yet");
    }
}

// Safety valves for the auto-solve loop below: a hard cap on total steps, and
// a cap on consecutive non-foundation tableau reshuffles so two columns can't
// shuffle a card back and forth forever without ever banking one.
const AUTO_SOLVE_MAX_ITERATIONS = 500;
const AUTO_SOLVE_STAGNATION_LIMIT = 40;

// Plays the rest of the game out mechanically once no hidden information is
// left (every tableau card face-up): repeatedly send whatever can legally go
// home to its foundation, fall back to a tableau reshuffle or a stock
// draw/recycle when nothing can, until the foundations are full or truly
// nothing is left to try. Reuses SolitaireMoveCard/SolitaireDraw's own
// Execute for every step rather than re-implementing move validation/scoring.
@serializable
export class SolitaireAutoSolve implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = (new Date()).toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = "Unknown";
    senderUsername: string = "Unknown";
    readonly className = "SolitaireAutoSolve";

    myString() {
        return `Solitaire AutoSolve!`;
    }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const state = (gameData as ISolitaireGameData).specificGameState;

        if (hasHiddenTableauCards(state.tableau)) {
            return INVALID_DRAW;
        }

        // Every sub-step below pushes its own undo snapshot; collapse them
        // all into the single pre-auto-solve snapshot captured here, so one
        // Undo reverts the whole run instead of dozens of individual steps.
        const before = snapshotOf(state);
        const undoStackDepth = state.undoStack.length;

        let progressed = false;
        let stagnantMoves = 0;
        for (let i = 0; i < AUTO_SOLVE_MAX_ITERATIONS && foundationCardCount(state.foundations) < 52; i++) {
            const moves = getLegalMoves(toLegalMoveState(state));
            const foundationMove = moves.find((m) => m.destination.zone === 'foundation');
            const chosen = foundationMove
                ?? (stagnantMoves < AUTO_SOLVE_STAGNATION_LIMIT
                    ? moves.find((m) => m.source.zone === 'tableau' && m.destination.zone === 'tableau')
                    : undefined);

            if (chosen) {
                const move = new SolitaireMoveCard();
                move.senderId = this.senderId;
                move.senderUsername = this.senderUsername;
                move.source = chosen.source;
                move.destination = chosen.destination;
                move.count = chosen.count;
                const outcome = await move.Execute(gameData);
                if (!outcome.validMove) break; // defensive - getLegalMoves already validated this
                progressed = true;
                stagnantMoves = foundationMove ? 0 : stagnantMoves + 1;
                continue;
            }

            if (canDraw(state.stock.length, state.waste.length)) {
                const draw = new SolitaireDraw();
                draw.senderId = this.senderId;
                draw.senderUsername = this.senderUsername;
                const outcome = await draw.Execute(gameData);
                if (!outcome.validMove) break;
                progressed = true;
                stagnantMoves = 0; // a new waste top may unlock tableau moves again
                continue;
            }

            break; // nothing left to try
        }

        if (!progressed) {
            return INVALID_DRAW;
        }

        state.undoStack.length = undoStackDepth;
        state.undoStack.push(before);

        // The stagnation/iteration caps above exist precisely so this can stop
        // short of a win - don't claim victory when it didn't actually get there.
        const summary = foundationCardCount(state.foundations) === 52
            ? `${this.senderUsername} auto-solved the rest of the game`
            : `${this.senderUsername} auto-played as far as it could`;
        gameData.gameState.history.unshift(summary);
        markDirty(gameData);
        return { turnOver: false, validMove: true };
    }

    Undo(gameData: IGameData) {
        console.error("Command Undo not implemented yet");
    }
}
