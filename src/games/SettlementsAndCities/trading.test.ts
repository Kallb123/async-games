import { describe, expect, it } from "vitest";

import {
    SettlementsAndCitiesGameType,
    SACAcceptTrade,
    SACEndTurn,
    SACMaritimeTrade,
    SACOfferTrade,
    SACUndo,
    SACWithdrawTrade,
} from "./SettlementsAndCitiesLogic";
import { cmd, makeGame, makeState, player, rollOf } from "./testFixtures";
import type { ISACResources, ISACSpecificGameState } from "./board";
import { BOARD_TOPOLOGY, NO_RESOURCES } from "./board";
import { gameStateToResponse } from "./SettlementsAndCitiesModels";
import type { ISettlementsAndCitiesGameData } from "./SettlementsAndCitiesModels";
import type { ISACSpecificGameStateResponse } from "./apiModels";
import { SAC_MAX_OFFERS_POSTED_PER_TURN, SAC_MAX_OPEN_OFFERS, sacOfferEndsThisTurn, sacTradeSide, sacValidTradeTerms } from "./trading";
import { settlementsAndCitiesRecapAdapter } from "./recap";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";
import { recordedOnTurnOf } from "@/utils/apiModels/gameCommand";
import { runCommand } from "@/utils/games/commandPipeline";
import { buildTimeline, type ITurnSnapshot } from "@/utils/games/replay";
import { getPlayerDropoutAdapter } from "@/utils/games/playerDropout";

const NAMES = { u1: "Alice", u2: "Bob", u3: "Carol" };

// The route's own decision: a command from anyone but `currentTurn` goes down
// the out-of-turn path (docs/out-of-turn-actions.md §5.2).
function run(game: ISettlementsAndCitiesGameData, command: IGameCommand) {
    return runCommand(game as unknown as IGameData, new SettlementsAndCitiesGameType(), command, {
        outOfTurn: command.senderId !== game.currentTurn,
    });
}

function res(amounts: Partial<ISACResources>): ISACResources {
    return { ...NO_RESOURCES, ...amounts };
}

function offerOf(give: Partial<ISACResources>, want: Partial<ISACResources>, sender = "u2"): SACOfferTrade {
    const offer = cmd(new SACOfferTrade(), sender);
    offer.give = res(give);
    offer.want = res(want);
    return offer;
}

function acceptOf(offerId: string, sender = "u1"): SACAcceptTrade {
    const accept = cmd(new SACAcceptTrade(), sender);
    accept.offerId = offerId;
    return accept;
}

// u1 is on turn, rolled; u2 holds a lumber and u1 a wool.
function table(overrides: Partial<ISACSpecificGameState> = {}): ISettlementsAndCitiesGameData {
    const gs = makeState({
        playerStates: new Map([
            ["u1", player({ resources: { wool: 2 } })],
            ["u2", player({ resources: { lumber: 2 } })],
        ]),
        ...overrides,
    });
    return makeGame(gs);
}

describe("trading rules", () => {
    it("reads a side of an offer into a clean record, and refuses anything else", () => {
        expect(sacTradeSide({ lumber: 1, extra: "x" })).toEqual(res({ lumber: 1 }));
        expect(sacTradeSide({ lumber: -1 })).toBeNull();
        expect(sacTradeSide({ lumber: 1.5 })).toBeNull();
        expect(sacTradeSide({ lumber: "1" })).toBeNull();
        expect(sacTradeSide({ lumber: 20 })).toBeNull();
        expect(sacTradeSide(null)).toBeNull();
    });

    it("needs something each way, and no resource on both sides", () => {
        expect(sacValidTradeTerms(res({ lumber: 1 }), res({ wool: 1 }))).toBe(true);
        expect(sacValidTradeTerms(res({ lumber: 1 }), res({}))).toBe(false);
        expect(sacValidTradeTerms(res({ lumber: 1, wool: 1 }), res({ wool: 2 }))).toBe(false);
    });

    it("lapses an offer at the end of its proposer's next turn, not the one it was posted in", () => {
        expect(sacOfferEndsThisTurn({ proposerId: "u1", postedOnOwnTurn: true }, "u1")).toBe(false);
        expect(sacOfferEndsThisTurn({ proposerId: "u1", postedOnOwnTurn: false }, "u1")).toBe(true);
        expect(sacOfferEndsThisTurn({ proposerId: "u1", postedOnOwnTurn: false }, "u2")).toBe(false);
    });
});

describe("SACOfferTrade", () => {
    it("posts an offer on somebody else's turn without taking the turn", async () => {
        const game = table();
        const offer = offerOf({ lumber: 1 }, { wool: 1 });
        const { outcome } = await run(game, offer);

        expect(outcome).toMatchObject({ validMove: true, turnOver: false });
        expect(game.currentTurn).toBe("u1");
        expect(recordedOnTurnOf(offer)).toBe("u1");
        expect(game.specificGameState.tradeOffers).toEqual([
            { offerId: offer.id, proposerId: "u2", give: res({ lumber: 1 }), want: res({ wool: 1 }), postedOnOwnTurn: false },
        ]);
        // Nothing leaves the hand until someone accepts.
        expect(game.specificGameState.playerStates.get("u2")!.resources.lumber).toBe(2);
        expect(game.gameState.history[0].text).toBe("{{u2}} offered 🪵1 for 🐑1, on {{u1}}'s turn");
    });

    it("records clean sides, whatever else the client sent with them", async () => {
        const game = table();
        const offer = offerOf({ lumber: 1 }, { wool: 1 });
        (offer.give as unknown as Record<string, unknown>).junk = "<script>";
        await run(game, offer);
        expect(offer.give).toEqual(res({ lumber: 1 }));
    });

    it.each([
        ["a gift", { lumber: 1 }, {}],
        ["a resource on both sides", { lumber: 1 }, { lumber: 1, wool: 1 }],
        ["more than the proposer holds", { lumber: 3 }, { wool: 1 }],
    ])("refuses %s", async (_label, give, want) => {
        const game = table();
        expect((await run(game, offerOf(give, want))).outcome.validMove).toBe(false);
        expect(game.specificGameState.tradeOffers).toEqual([]);
    });

    it("refuses during setup and while the robber moves", async () => {
        for (const overrides of [{ phase: "setup" as const }, { pendingRobber: true }]) {
            const game = table(overrides);
            expect((await run(game, offerOf({ lumber: 1 }, { wool: 1 }))).outcome.validMove).toBe(false);
        }
    });

    it("caps the offers one player may have open", async () => {
        const game = table();
        for (let i = 0; i < SAC_MAX_OPEN_OFFERS; i++) {
            expect((await run(game, offerOf({ lumber: 1 }, { wool: 1 }))).outcome.validMove).toBe(true);
        }
        expect((await run(game, offerOf({ lumber: 1 }, { wool: 1 }))).outcome.validMove).toBe(false);
        // Someone else still may.
        expect((await run(game, offerOf({ wool: 1 }, { lumber: 1 }, "u1"))).outcome.validMove).toBe(true);
    });

    it("caps how many one player may post in a turn, withdrawn ones included", async () => {
        const game = table();
        for (let i = 0; i < SAC_MAX_OFFERS_POSTED_PER_TURN; i++) {
            const offer = offerOf({ lumber: 1 }, { wool: 1 });
            expect((await run(game, offer)).outcome.validMove).toBe(true);
            const withdraw = cmd(new SACWithdrawTrade(), "u2");
            withdraw.offerId = offer.id;
            expect((await run(game, withdraw)).outcome.validMove).toBe(true);
        }
        expect((await run(game, offerOf({ lumber: 1 }, { wool: 1 }))).outcome.validMove).toBe(false);
        expect(gameStateToResponse(game.specificGameState, NAMES, "u2").myTradeOffersPosted).toBe(SAC_MAX_OFFERS_POSTED_PER_TURN);
        expect(gameStateToResponse(game.specificGameState, NAMES, "u1").myTradeOffersPosted).toBe(0);
    });
});

describe("SACAcceptTrade", () => {
    it("swaps both sides and takes the offer down, on the proposer's turn or anyone's", async () => {
        const game = table();
        const offer = offerOf({ lumber: 1 }, { wool: 1 });
        await run(game, offer);
        const accept = acceptOf(offer.id);

        const { outcome } = await run(game, accept);
        expect(outcome).toMatchObject({ validMove: true, turnOver: false });
        expect(game.specificGameState.playerStates.get("u1")!.resources).toEqual(res({ wool: 1, lumber: 1 }));
        expect(game.specificGameState.playerStates.get("u2")!.resources).toEqual(res({ lumber: 1, wool: 1 }));
        expect(game.specificGameState.tradeOffers).toEqual([]);
        expect(accept.settled).toEqual({ proposerId: "u2", give: res({ lumber: 1 }), want: res({ wool: 1 }) });
        expect(game.gameState.history[0].text).toBe("{{u1}} traded 🐑1 to {{u2}} for 🪵1");
        expect(accept.myString()).toBe("traded 🐑1 to {{u2}} for 🪵1");
    });

    it("lets a player off turn accept the active player's offer", async () => {
        const game = table();
        const offer = offerOf({ wool: 1 }, { lumber: 1 }, "u1");
        await run(game, offer);
        const accept = acceptOf(offer.id, "u2");
        expect((await run(game, accept)).outcome.validMove).toBe(true);
        expect(game.currentTurn).toBe("u1");
        expect(recordedOnTurnOf(accept)).toBe("u1");
        expect(game.gameState.history[0].text).toBe("{{u2}} traded 🪵1 to {{u1}} for 🐑1, on {{u1}}'s turn");
    });

    it("refuses a player's own offer, and a second acceptance", async () => {
        const game = table();
        const offer = offerOf({ lumber: 1 }, { wool: 1 });
        await run(game, offer);
        expect((await run(game, acceptOf(offer.id, "u2"))).outcome.validMove).toBe(false);
        expect((await run(game, acceptOf(offer.id))).outcome.validMove).toBe(true);
        expect((await run(game, acceptOf(offer.id))).outcome.validMove).toBe(false);
    });

    it("checks both hands again when it's accepted", async () => {
        const game = table();
        const offer = offerOf({ lumber: 2 }, { wool: 2 });
        await run(game, offer);
        // The proposer's hand has changed since they offered.
        game.specificGameState.playerStates.get("u2")!.resources.lumber = 1;
        expect((await run(game, acceptOf(offer.id))).outcome.validMove).toBe(false);
        game.specificGameState.playerStates.get("u2")!.resources.lumber = 2;
        game.specificGameState.playerStates.get("u1")!.resources.wool = 1;
        expect((await run(game, acceptOf(offer.id))).outcome.validMove).toBe(false);
        expect(game.specificGameState.tradeOffers).toHaveLength(1);
    });

    it("waits while the robber moves", async () => {
        const game = table();
        const offer = offerOf({ lumber: 1 }, { wool: 1 });
        await run(game, offer);
        game.specificGameState.pendingRobber = true;
        expect((await run(game, acceptOf(offer.id))).outcome.validMove).toBe(false);
    });

    it("leaves the active player's last move beyond undo", async () => {
        const game = table();
        game.specificGameState.playerStates.get("u1")!.resources.wool = 5;
        const trade = cmd(new SACMaritimeTrade());
        trade.offerResource = "wool";
        trade.wantResource = "ore";
        await run(game, trade);
        await run(game, offerOf({ lumber: 1 }, { wool: 1 }));
        expect((await run(game, cmd(new SACUndo()))).outcome.validMove).toBe(false);
    });
});

describe("SACWithdrawTrade", () => {
    it("takes down the proposer's own offer only", async () => {
        const game = table();
        const offer = offerOf({ lumber: 1 }, { wool: 1 });
        await run(game, offer);
        const byOther = cmd(new SACWithdrawTrade(), "u1");
        byOther.offerId = offer.id;
        expect((await run(game, byOther)).outcome.validMove).toBe(false);
        const byOwner = cmd(new SACWithdrawTrade(), "u2");
        byOwner.offerId = offer.id;
        expect((await run(game, byOwner)).outcome.validMove).toBe(true);
        expect(game.specificGameState.tradeOffers).toEqual([]);
    });
});

describe("when an offer lapses", () => {
    it("keeps an offer posted off turn until the end of its proposer's next turn", async () => {
        const game = table();
        await run(game, offerOf({ lumber: 1 }, { wool: 1 }));

        await run(game, cmd(new SACEndTurn()));
        expect(game.currentTurn).toBe("u2");
        expect(game.specificGameState.tradeOffers).toHaveLength(1);
        expect(game.specificGameState.tradeOffersPosted).toEqual([]);

        await run(game, rollOf(5, 3, "u2"));
        await run(game, cmd(new SACEndTurn(), "u2"));
        expect(game.currentTurn).toBe("u1");
        expect(game.specificGameState.tradeOffers).toEqual([]);
    });

    it("carries an offer posted on its proposer's own turn through the next round", async () => {
        const game = table();
        await run(game, offerOf({ wool: 1 }, { lumber: 1 }, "u1"));

        await run(game, cmd(new SACEndTurn()));
        expect(game.specificGameState.tradeOffers).toMatchObject([{ proposerId: "u1", postedOnOwnTurn: false }]);
        await run(game, rollOf(5, 3, "u2"));
        await run(game, cmd(new SACEndTurn(), "u2"));
        expect(game.specificGameState.tradeOffers).toHaveLength(1);
        await run(game, rollOf(5, 3));
        await run(game, cmd(new SACEndTurn()));
        expect(game.specificGameState.tradeOffers).toEqual([]);
    });

    it("goes with a player who drops out", () => {
        // Dropping re-awards Longest Road, which walks a whole board.
        const game = table({
            vertices: Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null })),
            edges: Array.from({ length: BOARD_TOPOLOGY.numEdges }, () => ({ hasRoad: false, owner: null })),
        });
        game.specificGameState.tradeOffers = [
            { offerId: "a", proposerId: "u2", give: res({ lumber: 1 }), want: res({ wool: 1 }), postedOnOwnTurn: false },
            { offerId: "b", proposerId: "u1", give: res({ wool: 1 }), want: res({ lumber: 1 }), postedOnOwnTurn: true },
        ];
        getPlayerDropoutAdapter("SettlementsAndCitiesGameType")!.dropPlayer(game, "u2");
        expect(game.specificGameState.tradeOffers!.map(o => o.offerId)).toEqual(["b"]);
    });
});

describe("trade offers on the wire and in review", () => {
    it("shows every offer to everyone", async () => {
        const game = table();
        await run(game, offerOf({ lumber: 1 }, { wool: 1 }));
        for (const viewer of ["u1", "u2", null]) {
            expect(gameStateToResponse(game.specificGameState, NAMES, viewer).tradeOffers).toMatchObject([
                { proposerId: "u2", give: res({ lumber: 1 }), want: res({ wool: 1 }) },
            ]);
        }
    });

    it("replays offers and trades played on other turns to the live table", async () => {
        const game = table();
        const offer = offerOf({ lumber: 1 }, { wool: 1 });
        await run(game, offer);
        await run(game, offerOf({ wool: 1 }, { lumber: 1 }, "u1"));
        await run(game, acceptOf(offer.id));
        await run(game, cmd(new SACEndTurn()));

        const lastId = game.gameState.commandHistory.at(-1)!.id;
        for (const viewerId of ["u1", "u2", null]) {
            const live = gameStateToResponse(game.specificGameState, NAMES, viewerId, lastId);
            const replayed = (await buildTimeline(game, NAMES, [], undefined, viewerId)).snapshots;
            const final = replayed.at(-1)!;
            expect(final.specificGameState as ISACSpecificGameStateResponse).toEqual(live);
            expect(final.currentTurn).toBe("u2");
        }
    });

    it("puts a settled trade in the recap, naming both sides", () => {
        const accept = acceptOf("offer-1");
        accept.settled = { proposerId: "u2", give: res({ lumber: 1 }), want: res({ wool: 1 }) };
        const state = gameStateToResponse(table().specificGameState, NAMES, null);
        const snap = { specificGameState: state } as ITurnSnapshot;
        const events = settlementsAndCitiesRecapAdapter.toEvents(snap, snap, accept, { validMove: true, turnOver: false });
        expect(events).toMatchObject([{
            type: "sac_trade",
            title: "Alice traded with Bob",
            detail: "gave 🐑1 for 🪵1",
            affectedIds: ["u2"],
        }]);
    });
});
