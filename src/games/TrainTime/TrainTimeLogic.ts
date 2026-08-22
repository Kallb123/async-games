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
    LONG_HAUL_BONUS,
    TICKETS_DRAWN_PER_TURN,
    TrainTimeCardColour,
    canClaimRoute,
    drawsTakenBy,
    isSetupTicketChoice,
    longestRuns,
    paymentIsValid,
    routeName,
    routeScore,
    ticketOutcomes,
    ticketPoints,
    ticketsToKeep,
    totalScore,
} from "@/games/TrainTime/board";
import { pluralize } from "@/utils/ui/text";
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

/**
 * True while this player owes an answer on tickets they've been offered — the
 * setup deal on their first turn, or an Action C draw. Nothing else can happen
 * on the turn until they answer.
 */
function awaitingTicketChoice(ps: ITrainTimePlayerState): boolean {
    return ps.pendingTickets.length > 0;
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
    gs.drawTurnOwner = null;
    const sender = playerState(gs, senderId);

    if (gs.finalRoundPending) {
        gs.finalRoundPending = gs.finalRoundPending.filter(userId => userId !== senderId);
        if (gs.finalRoundPending.length === 0) gs.gameOver = true;
        return;
    }

    if (sender && sender.trains <= FINAL_ROUND_TRAIN_THRESHOLD) {
        // Everyone, the trigger included, gets exactly one more turn.
        gs.finalRoundPending = [...trainData.gameState.turnOrder];
        trainData.gameState.history.unshift(
            `${senderUsername} is down to ${sender.trains} trains — last lap, everyone gets one more turn`,
        );
        return;
    }

    if (boardIsDeadlocked(trainData)) {
        gs.gameOver = true;
        trainData.gameState.history.unshift('No route left is short enough for anyone to build — the game ends here');
    }
}

/**
 * The Long Haul bonus (§7.3): +10 to whoever laid the longest continuous run
 * of track, shared by everybody tied for it. A table where nobody claimed a
 * route has no longest run to reward, so nobody gets it.
 */
function awardLongHaul(trainData: ITrainTimeGameData): void {
    const gs = trainData.specificGameState;

    const runs = longestRuns(gs.routeOwners, gs.playerStates.keys());
    const longest = Math.max(0, ...runs.values());

    const winners: string[] = [];
    for (const [userId, ps] of gs.playerStates) {
        const won = longest > 0 && runs.get(userId) === longest;
        ps.longHaulBonus = won ? LONG_HAUL_BONUS : 0;
        if (won) winners.push(userId);
    }
    if (winners.length === 0) return;

    // Scoring runs with no sender and no username map, so — like the
    // final-scores line below it — this reports the fact rather than the name.
    // Who actually banked it is on the final score sheet.
    trainData.gameState.history.unshift(
        `Long Haul bonus (+${LONG_HAUL_BONUS}) for the longest run of track — ${pluralize(longest, 'train')}, `
        + `${winners.length === 1 ? 'claimed outright' : `shared by ${winners.length} players`}`,
    );
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

        // Final scoring (§7). Route points are already on the board, so what's
        // left is the ticket reveal and the Long Haul bonus.
        for (const [userId, ps] of gs.playerStates) {
            const outcomes = ticketOutcomes(ps.tickets, gs.routeOwners, userId);
            ps.ticketScore = ticketPoints(outcomes);
            ps.ticketsCompleted = outcomes.filter(o => o.complete).length;
        }

        awardLongHaul(trainData);

        // Highest total wins; a tie goes to the most completed tickets (§7).
        const ranked = [...gs.playerStates].sort(([, a], [, b]) =>
            (totalScore(b) - totalScore(a)) || (b.ticketsCompleted - a.ticketsCompleted));
        const leader = ranked[0][1];
        const bestTotal = totalScore(leader);
        const winners = ranked
            .filter(([, ps]) => totalScore(ps) === bestTotal && ps.ticketsCompleted === leader.ticketsCompleted)
            .map(([userId]) => userId);

        trainData.complete = true;
        // A shared win is recorded as a draw (an empty winner), the same way
        // every other game in the app represents "nobody won outright".
        trainData.winner = winners.length === 1 ? winners[0] : '';
        trainData.currentTurn = '';
        trainData.gameState.history.unshift(
            winners.length === 1
                ? `Final scores are in — ${bestTotal} points wins it`
                : `Final scores are in — a ${bestTotal}-point tie`,
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
        if (awaitingTicketChoice(ps)) return INVALID;
        const drawnSoFar = drawsTakenBy(gs, this.senderId);
        if (drawnSoFar >= CARDS_DRAWN_PER_TURN) return INVALID;

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
                if (drawnSoFar > 0) return INVALID;
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
        gs.drawsThisTurn = drawnSoFar + 1;
        gs.drawTurnOwner = this.senderId;

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

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        if (awaitingTicketChoice(ps)) return INVALID;
        // A draw already started this turn is one action; you can't switch to
        // claiming halfway through it.
        if (drawsTakenBy(gs, this.senderId) > 0) return INVALID;

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

        // Claims are public, so the Long Haul race is too — the log calls out a
        // claim that puts this player in front (design doc §6, screen 14d).
        const runs = longestRuns(gs.routeOwners, gs.playerStates.keys());
        const myRun = runs.get(this.senderId) ?? 0;
        const bestRival = Math.max(0, ...[...runs].filter(([id]) => id !== this.senderId).map(([, run]) => run));
        const leadNote = myRun > bestRival ? ` — longest run now ${myRun}` : '';

        trainData.gameState.history.unshift(
            `${this.senderUsername} claimed ${routeName(route)} (${route.length} track, +${points})${leadNote}`,
        );

        finishTurn(trainData, this.senderId, this.senderUsername);
        markDirty(gameData);
        return { validMove: true, turnOver: true };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

// ─── Action C — draw Destination Tickets (§5) ───────────────────────────────

@serializable
export class TrainTimeDrawTickets implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className = 'TrainTimeDrawTickets';

    myString() { return `Train Time DrawTickets`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const trainData = gameData as ITrainTimeGameData;
        const gs = trainData.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;
        // One offer at a time, and not halfway through a draw action.
        if (awaitingTicketChoice(ps)) return INVALID;
        if (drawsTakenBy(gs, this.senderId) > 0) return INVALID;
        if (gs.ticketDeck.length === 0) return INVALID;

        // Three, or whatever is left — the deck is never reshuffled (§5).
        ps.pendingTickets = gs.ticketDeck.splice(0, TICKETS_DRAWN_PER_TURN);

        trainData.gameState.history.unshift(
            `${this.senderUsername} drew ${pluralize(ps.pendingTickets.length, 'destination ticket')}`,
        );

        // The turn isn't over until they say which ones they're keeping.
        markDirty(gameData);
        return { validMove: true, turnOver: false };
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}

/**
 * Answers whatever tickets are on the table: the keep-at-least-2 from setup on
 * a player's first turn, or the keep-at-least-1 that closes an Action C draw.
 * Which of the two it is decides whether the turn ends here — the setup choice
 * happens *before* the player's first action, the draw *is* their action.
 */
@serializable
export class TrainTimeKeepTickets implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    /** Ticket ids to keep; the rest go to the bottom of the ticket deck. */
    keep: number[] = [];
    readonly className = 'TrainTimeKeepTickets';

    myString() { return `Train Time KeepTickets keep=${this.keep.join(',')}`; }

    async Execute(gameData: IGameData): Promise<ICommandOutcome> {
        const trainData = gameData as ITrainTimeGameData;
        const gs = trainData.specificGameState;

        const ps = playerState(gs, this.senderId);
        if (!ps) return INVALID;

        const offered = ps.pendingTickets;
        if (offered.length === 0) return INVALID;

        const setupChoice = isSetupTicketChoice(ps);
        // A short ticket deck can offer fewer than the minimum, in which case
        // the minimum is simply everything on the table.
        const mustKeep = Math.min(ticketsToKeep(ps), offered.length);

        const keep = [...new Set(this.keep)];
        if (keep.length < mustKeep) return INVALID;
        if (keep.some(id => !offered.includes(id))) return INVALID;

        ps.tickets.push(...keep);
        // Returned tickets go to the bottom, so they come round again later (§5).
        gs.ticketDeck.push(...offered.filter(id => !keep.includes(id)));
        ps.pendingTickets = [];

        trainData.gameState.history.unshift(
            `${this.senderUsername} kept ${keep.length} of ${pluralize(offered.length, 'destination ticket')}`,
        );

        if (setupChoice) {
            // Their opening hand of tickets is settled; the turn itself is
            // still theirs to spend.
            markDirty(gameData);
            return { validMove: true, turnOver: false };
        }

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
 * board forever. Rejected whenever any real action is still available, with
 * one exception: a ticket deck with cards left in it doesn't block a pass.
 * Tickets you can no longer connect score negative, so forcing somebody to
 * draw them would make passing the punishment it exists to avoid.
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
        if (awaitingTicketChoice(ps)) return INVALID;
        if (drawsTakenBy(gs, this.senderId) > 0) return INVALID;
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
