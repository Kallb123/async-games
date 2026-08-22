import { describe, expect, it } from "vitest";
import { TrainTimeClaimRoute, TrainTimeDrawCarriageCard, TrainTimeGameType, TrainTimePassTurn } from "./TrainTimeLogic";
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
    buildCarriageDeck,
    buildPayment,
    canClaimRoute,
    marketNeedsWipe,
    paymentIsValid,
    payableColours,
    routeScore,
} from "./board";
import type { ICommandOutcome, IGameCommand } from "@/utils/apiModels/gameCommand";

// ─── Minimal in-memory game harness ─────────────────────────────────────────
// The commands only ever touch the plain IGameData-shaped object handed to
// them, so no Mongo/Clerk is needed. markModified is a Mongoose Document
// method the real route relies on; markDirty no-ops safely without it.
const PLAYERS = ["u1", "u2", "u3"];

function makeGame(userIds: string[] = PLAYERS, state?: ITrainTimeSpecificGameState): ITrainTimeGameData {
    return {
        gameId: "g",
        currentTurn: userIds[0],
        userIdList: userIds,
        gameState: { turnOrder: [...userIds], history: [], commandHistory: [] },
        specificGameState: state ?? buildInitialTrainTimeState(userIds),
        complete: false,
        winner: "",
    } as unknown as ITrainTimeGameData;
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
        expect(payableColours(greyRoute, ['engine', 'engine', 'engine'])).toContain('engine');
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
        expect(game.specificGameState.drawsThisTurn).toBe(0);
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

        const outcome = await play(game, claim(route.id, Array(4).fill('blue')));
        expect(outcome).toEqual({ validMove: true, turnOver: true });

        const me = game.specificGameState.playerStates.get("u1")!;
        expect(me.hand.length).toBe(0);
        expect(me.trains).toBe(TRAINS_PER_PLAYER - 4);
        expect(me.score).toBe(7);
        expect(me.routesClaimed).toBe(1);
        expect(game.specificGameState.routeOwners[route.id]).toBe("u1");
        expect(game.specificGameState.discard.length).toBe(4);
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
        // Everything short is gone and both players are down to two trains.
        ROUTES.forEach(route => { if (route.length <= 3) gs.routeOwners[route.id] = "u2"; });
        for (const ps of gs.playerStates.values()) ps.trains = 3;
        gs.playerStates.get("u1")!.score = 9;

        await play(game, drawFromDeck());
        expect(game.complete).toBe(false);
        await play(game, drawFromDeck());

        expect(game.complete).toBe(true);
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
            // Claim whenever possible (so the game actually races to the end),
            // otherwise draw, otherwise pass.
            // A draw is one action: once it's started it has to be finished.
            const claimable = gs.drawsThisTurn > 0 ? undefined : ROUTES.find(route => canClaimRoute(route, ctx));
            if (claimable) {
                const colour = payableColours(claimable, me.hand)[0];
                await play(game, claim(claimable.id, buildPayment(claimable, colour, me.hand)));
            } else if (gs.deck.length + gs.discard.length > 0) {
                await play(game, drawFromDeck());
            } else if (gs.market.length > 0) {
                await play(game, drawFromMarket(0));
            } else {
                await play(game, new TrainTimePassTurn());
            }
            expect(totalCards(gs)).toBe(110);
        }

        expect(game.complete).toBe(true);
        for (const ps of gs.playerStates.values()) expect(ps.trains).toBeGreaterThanOrEqual(0);
        // Every route on the board is claimed at most once.
        expect(gs.routeOwners.length).toBe(ROUTE_COUNT);
    });
});
