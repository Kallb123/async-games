import type { ITrainTimeGameData } from "@/games/TrainTime/TrainTimeModels";
import type { ITrainTimeSpecificGameState, ITrainTimePlayerState } from "@/games/TrainTime/board";
import type { ClaimContext } from "@/games/TrainTime/board";
import {
    ROUTES,
    drawFromDeck,
    refillMarket,
    CARDS_DRAWN_PER_TURN,
    DOUBLE_ROUTES_OPEN_FROM_PLAYERS,
    FINAL_ROUND_TRAIN_THRESHOLD,
    TrainTimeCardColour,
    canClaimRoute,
    paymentIsValid,
    routeName,
    routeScore,
} from "@/games/TrainTime/board";
import type { IGameData, IGameDataDocument } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';

// ═══════════════════════════════════════════════════════════════════════════
//  TRAIN TIME
// ═══════════════════════════════════════════════════════════════════════════

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

// routeOwners / finalRoundPending are Schema.Types.Mixed, and Mongoose only
// tracks top-level reassignment of those — same reason Solitaire flags its
// board dirty after every command.
function markDirty(gameData: IGameData) {
    (gameData as unknown as Partial<IGameDataDocument>).markModified?.('specificGameState');
}

function playerState(gs: ITrainTimeSpecificGameState, userId: string): ITrainTimePlayerState | undefined {
    return gs.playerStates.get(userId);
}

/** What the shared claim-legality helpers need to judge this player's move. */
function claimContextFor(trainData: ITrainTimeGameData, senderId: string, ps: ITrainTimePlayerState): ClaimContext {
    return {
        routeOwners: trainData.specificGameState.routeOwners,
        playerCount: trainData.gameState.turnOrder.length,
        hand: ps.hand,
        trains: ps.trains,
        playerId: senderId,
    };
}

/** Total cards a player could still draw from anywhere. */
function cardsAvailable(gs: ITrainTimeSpecificGameState): number {
    return gs.deck.length + gs.discard.length + gs.market.length;
}

/**
 * True when nobody can ever claim another route — every route still open is
 * longer than the most trains anyone has left. Drawing cards can't change
 * that (train counts only fall), so the game is finished rather than stuck.
 * Without this a table of short-on-trains players would draw forever.
 */
function boardIsDeadlocked(trainData: ITrainTimeGameData): boolean {
    const gs = trainData.specificGameState;
    const playerCount = trainData.gameState.turnOrder.length;
    let mostTrains = 0;
    for (const ps of gs.playerStates.values()) mostTrains = Math.max(mostTrains, ps.trains);

    return !ROUTES.some(route => {
        if (route.length > mostTrains) return false;
        if (gs.routeOwners[route.id] !== null) return false;
        const twinTaken = route.twinId !== null && gs.routeOwners[route.twinId] !== null;
        return !(twinTaken && playerCount < DOUBLE_ROUTES_OPEN_FROM_PLAYERS);
    });
}

/**
 * Closes out a turn's state (§7): resets the draw counter and moves the last
 * lap along. This has to run inside Execute rather than in CheckEndTurn,
 * because the command route asks CheckGameOver first — by the time
 * CheckEndTurn runs, the game-over decision has already been made.
 */
function finishTurn(trainData: ITrainTimeGameData, senderId: string, senderUsername: string): void {
    const gs = trainData.specificGameState;
    gs.drawsThisTurn = 0;

    if (gs.finalRoundPending) {
        gs.finalRoundPending = gs.finalRoundPending.filter(userId => userId !== senderId);
        if (gs.finalRoundPending.length === 0) gs.gameOver = true;
        return;
    }

    const ps = playerState(gs, senderId);
    if (ps && ps.trains <= FINAL_ROUND_TRAIN_THRESHOLD) {
        // Everyone, the trigger included, gets exactly one more turn.
        gs.finalRoundPending = [...trainData.gameState.turnOrder];
        trainData.gameState.history.unshift(
            `${senderUsername} is down to ${ps.trains} trains — last lap, everyone gets one more turn`,
        );
        return;
    }

    if (boardIsDeadlocked(trainData)) {
        gs.gameOver = true;
        trainData.gameState.history.unshift('No route left is short enough for anyone to build — the game ends here');
    }
}

// ─── Game type ──────────────────────────────────────────────────────────────

@serializable
export class TrainTimeGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "TrainTime";
    friendlyName: string = "Train Time";
    icon: string = "";
    url: string = "traintime";
    readonly className: string = "TrainTimeGameType";

    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        if (!commandOutcome.turnOver) return;
        const order = gameData.gameState.turnOrder;
        const idx = order.indexOf(gameData.currentTurn);
        gameData.currentTurn = order[(idx + 1) % order.length];
    }

    CheckGameOver(gameData: IGameData): boolean {
        const trainData = gameData as ITrainTimeGameData;
        const gs = trainData.specificGameState;
        if (!gs.gameOver) return false;

        // Step 1 of the build order scores route points only — Destination
        // Tickets and the Long Haul bonus (§7.2, §7.3) land with steps 2 and 3.
        let best = -Infinity;
        let winners: string[] = [];
        for (const [userId, ps] of gs.playerStates) {
            if (ps.score > best) {
                best = ps.score;
                winners = [userId];
            } else if (ps.score === best) {
                winners.push(userId);
            }
        }

        trainData.complete = true;
        // A shared win is recorded as a draw (an empty winner), the same way
        // every other game in the app represents "nobody won outright".
        trainData.winner = winners.length === 1 ? winners[0] : '';
        trainData.currentTurn = '';
        trainData.gameState.history.unshift(
            winners.length === 1
                ? `Final scores are in — ${best} points wins it`
                : `Final scores are in — a ${best}-point tie`,
        );
        markDirty(gameData);
        return true;
    }
}

// ─── Action A — draw a carriage card (§5) ───────────────────────────────────

@serializable
export class TrainTimeDrawCarriageCard implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    /** 'deck' draws blind off the top; 'market' takes one of the face-up cards. */
    source: 'deck' | 'market' = 'deck';
    /** Which face-up card, for a market draw. */
    marketIndex: number = 0;
    readonly className = 'TrainTimeDrawCarriageCard';

    myString() { return `Train Time DrawCarriageCard source=${this.source} index=${this.marketIndex}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const trainData = gameData as ITrainTimeGameData;
        const gs = trainData.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        if (gs.drawsThisTurn >= CARDS_DRAWN_PER_TURN) return INVALID;

        let drawn: TrainTimeCardColour;
        // Taking a face-up Engine costs the whole action, so it can only ever
        // be the first of the turn's draws (§5, "The Engine exception").
        let engineTax = false;

        if (this.source === 'market') {
            // The market is shared state and moves while you're away: a draw
            // against a card that has already gone is rejected, not fudged.
            if (this.marketIndex < 0 || this.marketIndex >= gs.market.length) return INVALID;
            drawn = gs.market[this.marketIndex];
            if (drawn === 'engine') {
                if (gs.drawsThisTurn > 0) return INVALID;
                engineTax = true;
            }
            gs.market.splice(this.marketIndex, 1);
            refillMarket(gs);
        } else {
            const card = drawFromDeck(gs);
            if (card === null) return INVALID;
            drawn = card;
        }

        ps.hand.push(drawn);
        gs.drawsThisTurn++;

        trainData.gameState.history.unshift(
            this.source === 'market'
                ? `${this.senderUsername} took the face-up ${drawn}`
                : `${this.senderUsername} drew from the deck`,
        );

        // The turn ends on the second card, on the Engine tax, or early if
        // there is simply nothing left anywhere to take.
        const turnOver = engineTax
            || gs.drawsThisTurn >= CARDS_DRAWN_PER_TURN
            || cardsAvailable(gs) === 0;
        if (turnOver) finishTurn(trainData, this.senderId, this.senderUsername);

        markDirty(gameData);
        return { validMove: true, turnOver };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Action B — claim a route (§5) ──────────────────────────────────────────

@serializable
export class TrainTimeClaimRoute implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    routeId: number = 0;
    /** The exact cards being spent, e.g. ['red','red','engine']. */
    cards: TrainTimeCardColour[] = [];
    readonly className = 'TrainTimeClaimRoute';

    myString() { return `Train Time ClaimRoute route=${this.routeId} cards=${this.cards.join(',')}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const trainData = gameData as ITrainTimeGameData;
        const gs = trainData.specificGameState;

        // A draw already started this turn is one action; you can't switch to
        // claiming halfway through it.
        if (gs.drawsThisTurn > 0) return INVALID;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;

        const route = ROUTES[this.routeId];
        if (!route) return INVALID;

        if (!canClaimRoute(route, claimContextFor(trainData, this.senderId, ps))) return INVALID;
        if (!paymentIsValid(route, this.cards, ps.hand)) return INVALID;

        for (const card of this.cards) {
            ps.hand.splice(ps.hand.indexOf(card), 1);
            gs.discard.push(card);
        }

        const points = routeScore(route.length);
        gs.routeOwners[this.routeId] = this.senderId;
        ps.trains -= route.length;
        ps.score += points;
        ps.routesClaimed++;

        trainData.gameState.history.unshift(
            `${this.senderUsername} claimed ${routeName(route)} (${route.length} track, +${points})`,
        );

        finishTurn(trainData, this.senderId, this.senderUsername);
        markDirty(gameData);
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Stalemate escape hatch ─────────────────────────────────────────────────

/**
 * Passing isn't one of the game's three actions — it exists only so a player
 * with nothing left to draw and no route they can pay for can't stall the
 * board forever. Rejected whenever any real action is still available.
 */
@serializable
export class TrainTimePassTurn implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'TrainTimePassTurn';

    myString() { return `Train Time PassTurn`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const trainData = gameData as ITrainTimeGameData;
        const gs = trainData.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        if (gs.drawsThisTurn > 0) return INVALID;
        if (cardsAvailable(gs) > 0) return INVALID;

        const ctx = claimContextFor(trainData, this.senderId, ps);
        if (ROUTES.some(route => canClaimRoute(route, ctx))) return INVALID;

        trainData.gameState.history.unshift(`${this.senderUsername} had no legal move and passed`);
        finishTurn(trainData, this.senderId, this.senderUsername);
        markDirty(gameData);
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
