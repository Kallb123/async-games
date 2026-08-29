import { describe, expect, it } from "vitest";
import {
    TrainTimeClaimRoute,
    TrainTimeDrawCarriageCard,
    TrainTimeDrawTickets,
    TrainTimeGameType,
    TrainTimeKeepTickets,
    TrainTimePassTurn,
} from "./TrainTimeLogic";
import { ITrainTimeGameData } from "./TrainTimeModels";
import {
    buildInitialTrainTimeState,
    ITrainTimeSpecificGameState,
    CITIES,
    ROUTES,
    ROUTE_COUNT,
    TRAINS_PER_PLAYER,
    TRAIN_TIME_CARD_COLOURS,
    TrainTimeCardColour,
    SETUP_TICKETS_KEPT_MIN,
    LONG_HAUL_BONUS,
    TICKETS,
    TICKET_COUNT,
    buildCarriageDeck,
    buildPayment,
    canClaimRoute,
    cityName,
    drawsTakenBy,
    longestRun,
    paymentOptions,
    marketNeedsWipe,
    paymentIsValid,
    payableColours,
    playerNetwork,
    routeScore,
    ticketIsComplete,
    ticketsToKeep,
    totalScore,
} from "./board";
import type { ICommandOutcome, IGameCommand } from "@/utils/apiModels/gameCommand";

// ─── Minimal in-memory game harness ─────────────────────────────────────────
// The commands only ever touch the plain IGameData-shaped object handed to
// them, so no Mongo/Clerk is needed. markModified is a Mongoose Document
// method the real route relies on; markDirty no-ops safely without it.
const PLAYERS = ["u1", "u2", "u3"];

function makeGame(
    userIds: string[] = PLAYERS,
    state?: ITrainTimeSpecificGameState,
    // Most tests want a game already under way, so the opening keep-2-of-3 is
    // settled by default; the ticket tests ask for it unsettled.
    { openingTicketsSettled = true }: { openingTicketsSettled?: boolean } = {},
): ITrainTimeGameData {
    const specificGameState = state ?? buildInitialTrainTimeState(userIds);
    if (openingTicketsSettled) settleOpeningTickets(specificGameState);
    return {
        gameId: "g",
        currentTurn: userIds[0],
        userIdList: userIds,
        gameState: { turnOrder: [...userIds], history: [], commandHistory: [] },
        specificGameState,
        complete: false,
        winner: "",
    } as unknown as ITrainTimeGameData;
}

/** Everybody keeps the first two of their dealt tickets, as if they'd chosen. */
function settleOpeningTickets(state: ITrainTimeSpecificGameState): void {
    for (const ps of state.playerStates.values()) {
        ps.tickets = ps.pendingTickets.slice(0, SETUP_TICKETS_KEPT_MIN);
        state.ticketDeck.push(...ps.pendingTickets.slice(SETUP_TICKETS_KEPT_MIN));
        ps.pendingTickets = [];
    }
}

/** Drops everyone's tickets, for the tests that are only about route points. */
function clearTickets(state: ITrainTimeSpecificGameState): void {
    for (const ps of state.playerStates.values()) {
        ps.tickets = [];
        ps.pendingTickets = [];
    }
}

/** Runs one command exactly the way the command route does. */
async function play(game: ITrainTimeGameData, command: IGameCommand): Promise<ICommandOutcome> {
    command.senderId = game.currentTurn;
    command.senderUsername = game.currentTurn;
    const outcome = await command.Execute(game);
    if (!outcome.validMove) return outcome;
    const gameType = new TrainTimeGameType();
    if (gameType.CheckGameOver(game)) return outcome;
    gameType.CheckEndTurn(game, outcome);
    return outcome;
}

function drawFromDeck() { return new TrainTimeDrawCarriageCard(); }

function drawFromMarket(index: number) {
    const command = new TrainTimeDrawCarriageCard();
    command.source = 'market';
    command.marketIndex = index;
    return command;
}

function claim(routeId: number, cards: TrainTimeCardColour[]) {
    const command = new TrainTimeClaimRoute();
    command.routeId = routeId;
    command.cards = cards;
    return command;
}

function keepTickets(ids: number[]) {
    const command = new TrainTimeKeepTickets();
    command.keep = ids;
    return command;
}

/** Two players level on track points, one turn from the end, holding no tickets. */
function endgame(): ITrainTimeGameData {
    const game = makeGame(["u1", "u2"]);
    const gs = game.specificGameState;
    clearTickets(gs);
    for (const ps of gs.playerStates.values()) {
        ps.score = 20;
        ps.trains = 2;
    }
    gs.finalRoundPending = ["u1", "u2"];
    return game;
}

/** Plays out the last lap of a two-player game with draws only. */
async function playOutLastLap(game: ITrainTimeGameData): Promise<void> {
    for (let i = 0; i < 4; i++) await play(game, drawFromDeck());
}

/** Every ticket is either in the deck, kept by somebody, or on offer to them. */
function totalTickets(state: ITrainTimeSpecificGameState): number {
    let held = 0;
    for (const ps of state.playerStates.values()) held += ps.tickets.length + ps.pendingTickets.length;
    return state.ticketDeck.length + held;
}

function totalCards(state: ITrainTimeSpecificGameState): number {
    let inHands = 0;
    for (const ps of state.playerStates.values()) inHands += ps.hand.length;
    return state.deck.length + state.discard.length + state.market.length + inHands;
}

describe("board data", () => {
    it("is the 36-city, 100-route North American map", () => {
        expect(CITIES.length).toBe(36);
        expect(ROUTE_COUNT).toBe(100);
        expect(ROUTES.every(r => r.length >= 1 && r.length <= 6)).toBe(true);
        expect(ROUTES.every(r => r.cityA !== r.cityB)).toBe(true);
    });

    it("pairs every double route with its twin, both ways", () => {
        for (const route of ROUTES) {
            if (route.twinId === null) continue;
            const twin = ROUTES[route.twinId];
            expect(twin.twinId).toBe(route.id);
            expect(twin.length).toBe(route.length);
            expect(new Set([twin.cityA, twin.cityB])).toEqual(new Set([route.cityA, route.cityB]));
        }
    });

    it("scores the steep §6 curve", () => {
        expect([1, 2, 3, 4, 5, 6].map(routeScore)).toEqual([1, 2, 4, 7, 10, 15]);
    });

    it("builds a 110-card deck: 12 of each colour plus 14 Engines", () => {
        const deck = buildCarriageDeck();
        expect(deck.length).toBe(110);
        expect(deck.filter(c => c === 'engine').length).toBe(14);
        for (const colour of TRAIN_TIME_CARD_COLOURS) {
            expect(deck.filter(c => c === colour).length).toBe(12);
        }
    });
});

describe("claim legality", () => {
    const greyRoute = ROUTES.find(r => r.colour === 'grey' && r.length === 3)!;
    const blueRoute = ROUTES.find(r => r.colour === 'blue' && r.length === 3)!;

    it("lets any single colour pay a grey route, Engines included", () => {
        expect(payableColours(greyRoute, ['red', 'red', 'red']).sort()).toEqual(['red']);
        expect(payableColours(greyRoute, ['red', 'red', 'engine']).sort()).toEqual(['red']);
        // All-Engine pays anything: every card played is a wild, so every
        // colour is "payable" and the payment comes out as three Locos.
        expect(payableColours(greyRoute, ['engine', 'engine', 'engine']).length).toBe(8);
        expect(payableColours(greyRoute, ['red', 'red', 'blue'])).toEqual([]);
    });

    it("only accepts a coloured route's own colour", () => {
        expect(payableColours(blueRoute, ['blue', 'blue', 'blue'])).toEqual(['blue']);
        expect(payableColours(blueRoute, ['red', 'red', 'red'])).toEqual([]);
        expect(payableColours(blueRoute, ['blue', 'engine', 'engine'])).toEqual(['blue']);
    });

    it("spends coloured cards before Engines", () => {
        expect(buildPayment(blueRoute, 'blue', ['blue', 'blue', 'engine', 'engine'])).toEqual(['blue', 'blue', 'engine']);
    });

    it("rejects a payment that mixes colours, miscounts, or isn't held", () => {
        expect(paymentIsValid(greyRoute, ['red', 'red', 'blue'], ['red', 'red', 'blue'])).toBe(false);
        expect(paymentIsValid(greyRoute, ['red', 'red'], ['red', 'red'])).toBe(false);
        expect(paymentIsValid(greyRoute, ['red', 'red', 'red'], ['red', 'red'])).toBe(false);
        expect(paymentIsValid(blueRoute, ['red', 'red', 'red'], ['red', 'red', 'red'])).toBe(false);
        expect(paymentIsValid(blueRoute, ['blue', 'engine', 'engine'], ['blue', 'engine', 'engine'])).toBe(true);
    });

    it("prices every colour a route could be paid in, cheapest wild use first", () => {
        const greyFour = ROUTES.find(r => r.colour === 'grey' && r.length === 4)!;
        const options = paymentOptions(greyFour, ['black', 'black', 'black', 'black', 'blue', 'engine']);

        // Black covers it outright, so it leads and spends no wild.
        expect(options[0]).toMatchObject({ colour: 'black', enginesUsed: 0, shortfall: 0 });
        // Blue is the nearest miss: 1 blue + the Loco still leaves it 2 short.
        const blue = options.find(o => o.colour === 'blue')!;
        expect(blue.shortfall).toBe(2);
        expect(blue.payment).toEqual([]);
        // Options are one per candidate colour — a grey route has all eight.
        expect(options.length).toBe(8);
    });

    it("pays a route entirely in Engines when that's all the hand has", () => {
        const blueThree = ROUTES.find(r => r.colour === 'blue' && r.length === 3)!;
        const options = paymentOptions(blueThree, ['engine', 'engine', 'engine']);
        expect(options[0]).toMatchObject({ colour: 'blue', shortfall: 0, enginesUsed: 3 });
        expect(options[0].payment).toEqual(['engine', 'engine', 'engine']);
        expect(paymentIsValid(blueThree, options[0].payment, ['engine', 'engine', 'engine'])).toBe(true);
    });

    it("closes the parallel track below 4 players, and never lets one player own both", () => {
        const route = ROUTES.find(r => r.twinId !== null)!;
        const owners: (string | null)[] = Array.from({ length: ROUTE_COUNT }, () => null);
        owners[route.twinId!] = "u2";
        const ctx = { routeOwners: owners, hand: ['engine', 'engine', 'engine', 'engine', 'engine', 'engine'] as TrainTimeCardColour[], trains: 45, playerId: "u1" };

        expect(canClaimRoute(route, { ...ctx, playerCount: 3 })).toBe(false);
        expect(canClaimRoute(route, { ...ctx, playerCount: 4 })).toBe(true);
        // Owning the twin yourself blocks it at any player count.
        owners[route.twinId!] = "u1";
        expect(canClaimRoute(route, { ...ctx, playerCount: 5 })).toBe(false);
    });
});

describe("setup", () => {
    it("deals 4 cards each and 5 face-up without losing a card", () => {
        const state = buildInitialTrainTimeState(PLAYERS);
        expect(totalCards(state)).toBe(110);
        expect(state.market.length).toBe(5);
        expect(marketNeedsWipe(state.market)).toBe(false);
        for (const ps of state.playerStates.values()) {
            expect(ps.hand.length).toBe(4);
            expect(ps.trains).toBe(TRAINS_PER_PLAYER);
            expect(ps.score).toBe(0);
        }
        expect(state.routeOwners.filter(Boolean).length).toBe(0);
    });
});

describe("Action A — drawing carriage cards", () => {
    it("takes two cards over one turn, ending it on the second", async () => {
        const game = makeGame();
        expect((await play(game, drawFromDeck())).turnOver).toBe(false);
        expect(game.currentTurn).toBe("u1");
        expect(game.specificGameState.playerStates.get("u1")!.hand.length).toBe(5);

        expect((await play(game, drawFromDeck())).turnOver).toBe(true);
        expect(game.currentTurn).toBe("u2");
        expect(game.specificGameState.playerStates.get("u1")!.hand.length).toBe(6);
        expect(drawsTakenBy(game.specificGameState, "u1")).toBe(0);
        expect(totalCards(game.specificGameState)).toBe(110);
    });

    it("charges a face-up Engine the whole action, and refuses it as a second draw", async () => {
        const game = makeGame();
        game.specificGameState.market[0] = 'engine';

        expect((await play(game, drawFromMarket(0))).turnOver).toBe(true);
        expect(game.currentTurn).toBe("u2");

        // u2 starts drawing, then reaches for a face-up Engine.
        await play(game, drawFromDeck());
        game.specificGameState.market[1] = 'engine';
        expect((await play(game, drawFromMarket(1))).validMove).toBe(false);
        expect(game.specificGameState.market[1]).toBe('engine');
    });

    it("doesn't leave half a draw behind when a turn is skipped", async () => {
        const game = makeGame();
        await play(game, drawFromDeck());
        // The turn timer skips u1 mid-draw, the way the shared cron does.
        game.currentTurn = "u2";

        expect((await play(game, drawFromDeck())).turnOver).toBe(false);
        expect((await play(game, drawFromDeck())).turnOver).toBe(true);
        expect(game.specificGameState.playerStates.get("u2")!.hand.length).toBe(6);
        // And u1's stale count doesn't cost them a card when they come back.
        expect(drawsTakenBy(game.specificGameState, "u1")).toBe(0);
    });

    it("refills the market from the deck and keeps it at five", async () => {
        const game = makeGame();
        await play(game, drawFromMarket(0));
        expect(game.specificGameState.market.length).toBe(5);
        expect(totalCards(game.specificGameState)).toBe(110);
    });

    it("rejects a draw against a face-up card that has already gone", async () => {
        const game = makeGame();
        expect((await play(game, drawFromMarket(9))).validMove).toBe(false);
    });
});

describe("Action B — claiming a route", () => {
    function setupClaim(routeColour: TrainTimeCardColour = 'blue') {
        const game = makeGame();
        const route = ROUTES.find(r => r.colour === routeColour && r.length === 4)!;
        game.specificGameState.playerStates.get("u1")!.hand = Array(4).fill(routeColour);
        return { game, route };
    }

    it("pays the cards, lays the trains and scores immediately", async () => {
        const { game, route } = setupClaim();
        const before = totalCards(game.specificGameState);
        const discardBefore = game.specificGameState.discard.length;

        const outcome = await play(game, claim(route.id, Array(4).fill('blue')));
        expect(outcome).toEqual({ validMove: true, turnOver: true });

        const me = game.specificGameState.playerStates.get("u1")!;
        expect(me.hand.length).toBe(0);
        expect(me.trains).toBe(TRAINS_PER_PLAYER - 4);
        expect(me.score).toBe(7);
        expect(me.routesClaimed).toBe(1);
        expect(game.specificGameState.routeOwners[route.id]).toBe("u1");
        expect(game.specificGameState.discard.length).toBe(discardBefore + 4);
        expect(totalCards(game.specificGameState)).toBe(before);
        expect(game.currentTurn).toBe("u2");
    });

    it("rejects a claim on a route somebody already owns", async () => {
        const { game, route } = setupClaim();
        game.specificGameState.routeOwners[route.id] = "u2";
        expect((await play(game, claim(route.id, Array(4).fill('blue')))).validMove).toBe(false);
        expect(game.specificGameState.playerStates.get("u1")!.hand.length).toBe(4);
    });

    it("rejects a claim once the turn's draw has started", async () => {
        const { game, route } = setupClaim();
        await play(game, drawFromDeck());
        game.specificGameState.playerStates.get("u1")!.hand = Array(4).fill('blue');
        expect((await play(game, claim(route.id, Array(4).fill('blue')))).validMove).toBe(false);
    });

    it("rejects a claim the player hasn't the trains for", async () => {
        const { game, route } = setupClaim();
        game.specificGameState.playerStates.get("u1")!.trains = 3;
        expect((await play(game, claim(route.id, Array(4).fill('blue')))).validMove).toBe(false);
    });
});

describe("game end", () => {
    it("gives everyone one more turn once someone ends on 2 trains, then scores up", async () => {
        const game = makeGame();
        const gs = game.specificGameState;
        const route = ROUTES.find(r => r.colour === 'blue' && r.length === 4)!;
        gs.playerStates.get("u1")!.hand = Array(4).fill('blue');
        gs.playerStates.get("u1")!.trains = 6;
        gs.playerStates.get("u1")!.score = 20;

        await play(game, claim(route.id, Array(4).fill('blue')));
        expect(gs.playerStates.get("u1")!.trains).toBe(2);
        expect(gs.finalRoundPending).toEqual(["u1", "u2", "u3"]);
        expect(game.complete).toBe(false);

        // u2 and u3 take their last turns…
        for (const player of ["u2", "u3"]) {
            expect(game.currentTurn).toBe(player);
            await play(game, drawFromDeck());
            await play(game, drawFromDeck());
            expect(game.complete).toBe(false);
        }

        // …and the game ends the moment the trigger player finishes theirs.
        expect(game.currentTurn).toBe("u1");
        await play(game, drawFromDeck());
        expect(game.complete).toBe(false);
        await play(game, drawFromDeck());

        expect(game.complete).toBe(true);
        expect(game.winner).toBe("u1");
        expect(game.currentTurn).toBe("");
    });

    it("records a tie on points as a shared win", async () => {
        const game = makeGame(["u1", "u2"]);
        const gs = game.specificGameState;
        clearTickets(gs);
        gs.finalRoundPending = ["u1"];
        gs.playerStates.get("u1")!.score = 12;
        gs.playerStates.get("u2")!.score = 12;

        await play(game, drawFromDeck());
        await play(game, drawFromDeck());

        expect(game.complete).toBe(true);
        expect(game.winner).toBe("");
    });
});

describe("deadlock", () => {
    it("ends the game when every route left is longer than anyone's trains", async () => {
        const game = makeGame(["u1", "u2"]);
        const gs = game.specificGameState;
        clearTickets(gs);
        // Everything short is gone and both players are down to two trains.
        ROUTES.forEach(route => { if (route.length <= 3) gs.routeOwners[route.id] = "u2"; });
        for (const ps of gs.playerStates.values()) ps.trains = 3;
        gs.playerStates.get("u1")!.score = 20;

        await play(game, drawFromDeck());
        expect(game.complete).toBe(false);
        await play(game, drawFromDeck());

        expect(game.complete).toBe(true);
        // u2 laid all that track, so the Long Haul is theirs — u1's points
        // still win it.
        expect(gs.playerStates.get("u2")!.longHaulBonus).toBe(LONG_HAUL_BONUS);
        expect(game.winner).toBe("u1");
    });
});

describe("passing", () => {
    it("is refused while there is still anything to draw", async () => {
        const game = makeGame();
        expect((await play(game, new TrainTimePassTurn())).validMove).toBe(false);
    });

    it("is allowed only with no cards left and no route the player can pay for", async () => {
        const game = makeGame();
        const gs = game.specificGameState;
        gs.deck = [];
        gs.discard = [];
        gs.market = [];
        for (const ps of gs.playerStates.values()) ps.hand = [];

        expect((await play(game, new TrainTimePassTurn())).validMove).toBe(true);
        expect(game.currentTurn).toBe("u2");
    });
});

describe("Destination Tickets — the deck", () => {
    it("is 30 tickets between real cities, worth 4 to 22", () => {
        expect(TICKET_COUNT).toBe(30);
        expect(new Set(TICKETS.map(t => `${t.cityA}-${t.cityB}`)).size).toBe(TICKET_COUNT);
        for (const ticket of TICKETS) {
            expect(cityName(ticket.cityA)).not.toBe(String(ticket.cityA));
            expect(cityName(ticket.cityB)).not.toBe(String(ticket.cityB));
            expect(ticket.cityA).not.toBe(ticket.cityB);
            expect(ticket.points).toBeGreaterThanOrEqual(4);
            expect(ticket.points).toBeLessThanOrEqual(22);
        }
    });

    it("only names city pairs the map can actually connect", () => {
        // The whole board is one component, so every ticket is winnable by
        // somebody — a ticket nobody could ever complete would be a pure tax.
        const wholeBoard = ROUTES.map(() => 'anyone');
        const network = playerNetwork(wholeBoard, 'anyone');
        for (const ticket of TICKETS) {
            expect(ticketIsComplete(ticket, network)).toBe(true);
        }
    });

    it("counts a ticket complete only over an unbroken chain the player owns", () => {
        const first = ROUTES[0];
        const onward = ROUTES.find(r =>
            r.id !== first.id
            && r.id !== first.twinId
            && (r.cityA === first.cityB || r.cityB === first.cityB))!;
        const owners: (string | null)[] = ROUTES.map(() => null);

        owners[first.id] = "u1";
        const start = playerNetwork(owners, "u1");
        const far = onward.cityA === first.cityB ? onward.cityB : onward.cityA;
        expect(start[first.cityA]).toBe(start[first.cityB]);
        expect(start[first.cityA]).not.toBe(start[far]);

        // Somebody else's track doesn't join anything up for you.
        owners[onward.id] = "u2";
        expect(playerNetwork(owners, "u1")[far]).not.toBe(start[first.cityA]);

        owners[onward.id] = "u1";
        const joined = playerNetwork(owners, "u1");
        expect(joined[first.cityA]).toBe(joined[far]);
    });
});

describe("Destination Tickets — the opening deal (§4)", () => {
    it("deals three to each player and keeps none until they choose", () => {
        const game = makeGame(PLAYERS, undefined, { openingTicketsSettled: false });
        const gs = game.specificGameState;
        for (const ps of gs.playerStates.values()) {
            expect(ps.pendingTickets.length).toBe(3);
            expect(ps.tickets).toEqual([]);
        }
        expect(totalTickets(gs)).toBe(TICKET_COUNT);
    });

    it("blocks every other action until the choice is made", async () => {
        const game = makeGame(PLAYERS, undefined, { openingTicketsSettled: false });
        expect((await play(game, drawFromDeck())).validMove).toBe(false);
        expect((await play(game, drawFromMarket(0))).validMove).toBe(false);
        expect((await play(game, new TrainTimeDrawTickets())).validMove).toBe(false);
        expect((await play(game, new TrainTimePassTurn())).validMove).toBe(false);
        expect(game.currentTurn).toBe("u1");
    });

    it("insists on two of the three, then hands the turn back to its owner", async () => {
        const game = makeGame(PLAYERS, undefined, { openingTicketsSettled: false });
        const gs = game.specificGameState;
        const dealt = [...gs.playerStates.get("u1")!.pendingTickets];

        expect((await play(game, keepTickets(dealt.slice(0, 1)))).validMove).toBe(false);
        // Tickets that were never offered aren't a way to swap the deal.
        expect((await play(game, keepTickets([dealt[0], gs.ticketDeck[0]]))).validMove).toBe(false);

        const outcome = await play(game, keepTickets(dealt.slice(0, 2)));
        expect(outcome.validMove).toBe(true);
        // The choice happens before the turn's action, so u1 still has it.
        expect(outcome.turnOver).toBe(false);
        expect(game.currentTurn).toBe("u1");

        const me = gs.playerStates.get("u1")!;
        expect(me.tickets).toEqual(dealt.slice(0, 2));
        expect(me.pendingTickets).toEqual([]);
        expect(gs.ticketDeck[gs.ticketDeck.length - 1]).toBe(dealt[2]);

        // And now they can take their turn as normal.
        expect((await play(game, drawFromDeck())).validMove).toBe(true);
    });
});

describe("Action C — drawing Destination Tickets (§5)", () => {
    it("draws three, keeps at least one, and spends the whole turn doing it", async () => {
        const game = makeGame();
        const gs = game.specificGameState;
        const topThree = gs.ticketDeck.slice(0, 3);

        const drawn = await play(game, new TrainTimeDrawTickets());
        expect(drawn.validMove).toBe(true);
        expect(drawn.turnOver).toBe(false);
        expect(gs.playerStates.get("u1")!.pendingTickets).toEqual(topThree);

        expect((await play(game, keepTickets([]))).validMove).toBe(false);

        const kept = await play(game, keepTickets([topThree[1]]));
        expect(kept.turnOver).toBe(true);
        expect(game.currentTurn).toBe("u2");

        const me = gs.playerStates.get("u1")!;
        expect(me.tickets).toContain(topThree[1]);
        expect(me.tickets.length).toBe(3);
        // The two handed back are at the bottom, in the order they were offered.
        expect(gs.ticketDeck.slice(-2)).toEqual([topThree[0], topThree[2]]);
        expect(totalTickets(gs)).toBe(TICKET_COUNT);
    });

    it("won't start a ticket draw halfway through a card draw", async () => {
        const game = makeGame();
        await play(game, drawFromDeck());
        expect((await play(game, new TrainTimeDrawTickets())).validMove).toBe(false);
    });

    it("offers whatever is left when the deck is nearly out, and never reshuffles it", async () => {
        const game = makeGame();
        const gs = game.specificGameState;
        gs.ticketDeck = [TICKETS[0].id];

        await play(game, new TrainTimeDrawTickets());
        expect(gs.playerStates.get("u1")!.pendingTickets).toEqual([TICKETS[0].id]);
        // The one ticket on the table is the minimum, so it has to be kept.
        expect((await play(game, keepTickets([]))).validMove).toBe(false);
        expect((await play(game, keepTickets([TICKETS[0].id]))).turnOver).toBe(true);

        expect(gs.ticketDeck).toEqual([]);
        expect((await play(game, new TrainTimeDrawTickets())).validMove).toBe(false);
    });
});

describe("final ticket scoring (§7)", () => {
    /** Gives a player the routes that join a ticket's two cities, if it can. */
    function connect(game: ITrainTimeGameData, userId: string, ticketId: number): void {
        const gs = game.specificGameState;
        const ticket = TICKETS[ticketId];
        // Breadth-first over the whole map, then hand over the path found.
        const previous = new Map<number, { city: number; routeId: number }>();
        const queue = [ticket.cityA];
        while (queue.length > 0) {
            const city = queue.shift() as number;
            if (city === ticket.cityB) break;
            for (const route of ROUTES) {
                const next = route.cityA === city ? route.cityB : route.cityB === city ? route.cityA : null;
                if (next === null || next === ticket.cityA || previous.has(next)) continue;
                previous.set(next, { city, routeId: route.id });
                queue.push(next);
            }
        }
        for (let city = ticket.cityB; city !== ticket.cityA;) {
            const step = previous.get(city);
            if (!step) throw new Error(`no path for ticket ${ticketId}`);
            gs.routeOwners[step.routeId] = userId;
            city = step.city;
        }
    }

    it("adds a connected ticket and subtracts one left hanging", async () => {
        const game = makeGame(["u1", "u2"]);
        const gs = game.specificGameState;
        const short = TICKETS.reduce((a, b) => (a.points <= b.points ? a : b));
        clearTickets(gs);
        for (const ps of gs.playerStates.values()) ps.trains = 2;
        gs.playerStates.get("u1")!.tickets = [short.id];
        gs.playerStates.get("u2")!.tickets = [short.id];
        connect(game, "u1", short.id);
        gs.finalRoundPending = ["u1", "u2"];

        await playOutLastLap(game);

        expect(game.complete).toBe(true);
        expect(gs.playerStates.get("u1")!.ticketScore).toBe(short.points);
        expect(gs.playerStates.get("u1")!.ticketsCompleted).toBe(1);
        expect(gs.playerStates.get("u2")!.ticketScore).toBe(-short.points);
        expect(gs.playerStates.get("u2")!.ticketsCompleted).toBe(0);
        expect(game.winner).toBe("u1");
    });

    it("breaks a tied total on completed tickets", async () => {
        const game = endgame();
        const gs = game.specificGameState;
        const ticket = TICKETS.reduce((a, b) => (a.points <= b.points ? a : b));
        // Same total: u1 gets there via the ticket and — since u2 laid no track
        // at all — the Long Haul too, so u1's track points come down by both.
        // What's left to separate them is the completed ticket.
        gs.playerStates.get("u1")!.tickets = [ticket.id];
        gs.playerStates.get("u1")!.score = 20 - ticket.points - LONG_HAUL_BONUS;
        connect(game, "u1", ticket.id);

        await playOutLastLap(game);

        expect(game.complete).toBe(true);
        const u1 = gs.playerStates.get("u1")!;
        const u2 = gs.playerStates.get("u2")!;
        expect(totalScore(u1)).toBe(totalScore(u2));
        expect(game.winner).toBe("u1");
    });
});

describe("the Long Haul bonus (§7)", () => {
    function cityId(name: string): number {
        const city = CITIES.find(c => c.name === name);
        if (!city) throw new Error(`no city called ${name}`);
        return city.id;
    }

    /** The route between two named cities — the first half, for a double. */
    function routeBetween(a: string, b: string): number {
        const from = cityId(a);
        const to = cityId(b);
        const route = ROUTES.find(r =>
            (r.cityA === from && r.cityB === to) || (r.cityA === to && r.cityB === from));
        if (!route) throw new Error(`no route between ${a} and ${b}`);
        return route.id;
    }

    /** Hands a player the named routes and reports their longest run. */
    function runOver(pairs: [string, string][], ownerId = "u1"): number {
        const owners: (string | null)[] = ROUTES.map(() => null);
        for (const [a, b] of pairs) owners[routeBetween(a, b)] = ownerId;
        return longestRun(owners, ownerId);
    }

    it("measures a chain in train spaces, not in routes", () => {
        // Vancouver → Calgary (3) → Helena (4) → Denver (4).
        expect(runOver([
            ["Vancouver", "Calgary"],
            ["Calgary", "Helena"],
            ["Helena", "Denver"],
        ])).toBe(11);
    });

    it("is 0 for a player who never claimed anything", () => {
        expect(runOver([])).toBe(0);
        expect(longestRun(ROUTES.map(() => "u2"), "u1")).toBe(0);
    });

    it("walks a loop once and keeps going down a spur", () => {
        // Denver → Santa Fe (2) → Phoenix (3) → Denver (5) closes a loop worth
        // 10; the Salt Lake City spur (3) extends the trail rather than
        // repeating a route.
        const loop: [string, string][] = [
            ["Denver", "Santa Fe"],
            ["Santa Fe", "Phoenix"],
            ["Phoenix", "Denver"],
        ];
        expect(runOver(loop)).toBe(10);
        expect(runOver([...loop, ["Salt Lake City", "Denver"]])).toBe(13);
    });

    it("still answers when handed a board no game could produce", () => {
        // 100 routes, both halves of every double, all one player's: far past
        // anything 45 trains could buy, and dense enough that an unbounded
        // trail search runs for minutes. The step budget is what keeps this
        // from hanging, so this test is the guard on it.
        expect(longestRun(ROUTES.map(() => "u1"), "u1")).toBeGreaterThan(0);
    });

    it("takes the best two arms of a branch, never the whole network", () => {
        // Three routes meeting at Denver: 2, 4 and 4. A trail can use two of
        // them, so the run is 8 — not the 10 the network adds up to.
        expect(runOver([
            ["Denver", "Santa Fe"],
            ["Denver", "Oklahoma City"],
            ["Helena", "Denver"],
        ])).toBe(8);
    });

    function give(game: ITrainTimeGameData, userId: string, pairs: [string, string][]): void {
        for (const [a, b] of pairs) game.specificGameState.routeOwners[routeBetween(a, b)] = userId;
    }

    it("adds 10 for the longest run, and can decide the game on its own", async () => {
        const game = endgame();
        const gs = game.specificGameState;
        // Both are level on track points; only u1 laid any continuous track.
        give(game, "u1", [["Denver", "Santa Fe"], ["Santa Fe", "Phoenix"]]);

        await playOutLastLap(game);

        expect(game.complete).toBe(true);
        expect(gs.playerStates.get("u1")!.longHaulBonus).toBe(LONG_HAUL_BONUS);
        expect(gs.playerStates.get("u2")!.longHaulBonus).toBe(0);
        expect(totalScore(gs.playerStates.get("u1")!)).toBe(20 + LONG_HAUL_BONUS);
        expect(totalScore(gs.playerStates.get("u2")!)).toBe(20);
        expect(game.winner).toBe("u1");
    });

    it("is shared by everyone tied for the longest run", async () => {
        const game = endgame();
        const gs = game.specificGameState;
        // Denver → Santa Fe → Phoenix is 5; so is Los Angeles → Las Vegas →
        // Salt Lake City.
        give(game, "u1", [["Denver", "Santa Fe"], ["Santa Fe", "Phoenix"]]);
        give(game, "u2", [["Los Angeles", "Las Vegas"], ["Las Vegas", "Salt Lake City"]]);

        await playOutLastLap(game);

        expect(game.complete).toBe(true);
        for (const ps of gs.playerStates.values()) expect(ps.longHaulBonus).toBe(LONG_HAUL_BONUS);
        // Still level, so the win is shared rather than bought by the bonus.
        expect(game.winner).toBe("");
    });

    it("goes to nobody when the board is empty", async () => {
        const game = endgame();
        const gs = game.specificGameState;

        await playOutLastLap(game);

        expect(game.complete).toBe(true);
        for (const ps of gs.playerStates.values()) expect(ps.longHaulBonus).toBe(0);
    });

    it("calls out a claim that takes the longest-run lead", async () => {
        const game = makeGame(["u1", "u2"]);
        const gs = game.specificGameState;
        const routeId = routeBetween("Denver", "Santa Fe");
        const route = ROUTES[routeId];
        gs.playerStates.get("u1")!.hand = Array(route.length).fill('red');

        await play(game, claim(routeId, Array(route.length).fill('red')));

        expect(game.gameState.history[0].text).toContain(`longest run now ${route.length}`);
    });
});

describe("a full simulated game", () => {
    it("never loses or duplicates a carriage card, and always terminates", async () => {
        const game = makeGame(["u1", "u2", "u3", "u4"]);
        const gs = game.specificGameState;

        let turns = 0;
        while (!game.complete && turns < 5000) {
            turns++;
            const me = gs.playerStates.get(game.currentTurn)!;
            const ctx = {
                routeOwners: gs.routeOwners,
                playerCount: game.gameState.turnOrder.length,
                hand: me.hand,
                trains: me.trains,
                playerId: game.currentTurn,
            };
            // Tickets on the table have to be answered before anything else.
            if (me.pendingTickets.length > 0) {
                await play(game, keepTickets(me.pendingTickets.slice(0, ticketsToKeep(me))));
                expect(totalTickets(gs)).toBe(TICKET_COUNT);
                continue;
            }

            // Claim whenever possible (so the game actually races to the end),
            // otherwise draw, otherwise pass.
            // A draw is one action: once it's started it has to be finished.
            const midDraw = drawsTakenBy(gs, game.currentTurn) > 0;
            const claimable = midDraw ? undefined : ROUTES.find(route => canClaimRoute(route, ctx));
            if (claimable) {
                const colour = payableColours(claimable, me.hand)[0];
                await play(game, claim(claimable.id, buildPayment(claimable, colour, me.hand)));
            } else if (!midDraw && gs.ticketDeck.length > 0 && turns % 6 === 0) {
                await play(game, new TrainTimeDrawTickets());
            } else if (gs.deck.length + gs.discard.length > 0) {
                await play(game, drawFromDeck());
            } else if (gs.market.length > 0) {
                await play(game, drawFromMarket(0));
            } else {
                await play(game, new TrainTimePassTurn());
            }
            expect(totalCards(gs)).toBe(110);
            expect(totalTickets(gs)).toBe(TICKET_COUNT);
        }

        expect(game.complete).toBe(true);
        for (const ps of gs.playerStates.values()) expect(ps.trains).toBeGreaterThanOrEqual(0);
        // Every route on the board is claimed at most once.
        expect(gs.routeOwners.length).toBe(ROUTE_COUNT);
    });
});
