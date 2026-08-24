import { describe, expect, it } from "vitest";
import { trainTimeRecapAdapter } from "./recap";
import { ROUTES, routeName, routeScore } from "./board";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type {
    ITrainTimeSpecificGameStateResponse,
    ITrainTimePlayerStateResponse,
    ITrainTimeTicketView,
} from "./apiModels";

const VALID: ICommandOutcome = { validMove: true, turnOver: true };
const ROUTE = ROUTES[0];

function player(
    overrides: Partial<ITrainTimePlayerStateResponse> & { userId: string; username: string },
): ITrainTimePlayerStateResponse {
    return {
        handCount: 4,
        ticketCount: 2,
        trains: 45,
        score: 0,
        ticketScore: 0,
        ticketsCompleted: 0,
        longHaulBonus: 0,
        longestRun: 0,
        routesClaimed: 0,
        ...overrides,
    };
}

function state(
    players: ITrainTimePlayerStateResponse[],
    overrides: Partial<ITrainTimeSpecificGameStateResponse> = {},
): ITrainTimeSpecificGameStateResponse {
    const playerStates: ITrainTimeSpecificGameStateResponse['playerStates'] = {};
    for (const p of players) playerStates[p.username] = p;
    return {
        market: ["red", "green", "engine", "blue", "white"],
        deckCount: 40,
        discardCount: 0,
        routeOwners: ROUTES.map(() => null),
        playerStates,
        myDrawsThisTurn: 0,
        ticketDeckCount: 10,
        myTickets: [],
        myPendingTickets: [],
        myTicketsToKeep: 0,
        finalRoundPending: null,
        scored: false,
        myHand: [],
        ...overrides,
    };
}

function snap(gs: ITrainTimeSpecificGameStateResponse): ITurnSnapshot {
    return { index: 0, specificGameState: gs, currentTurn: "", complete: false, winner: "", history: [], command: null, planned: false };
}

function cmd(overrides: Partial<IGameCommand> & { className: string }): IGameCommand {
    return {
        id: "c1",
        timestamp: "2026-08-24T09:00:00.000Z",
        senderId: "u1",
        senderUsername: "Alice",
        ...overrides,
    } as unknown as IGameCommand;
}

const ALICE = player({ userId: "u1", username: "Alice" });
const BOB = player({ userId: "u2", username: "Bob" });

function events(
    prev: ITrainTimeSpecificGameStateResponse,
    next: ITrainTimeSpecificGameStateResponse,
    command: IGameCommand,
) {
    return trainTimeRecapAdapter.toEvents(snap(prev), snap(next), command, VALID);
}

function ticket(overrides: Partial<ITrainTimeTicketView> = {}): ITrainTimeTicketView {
    return { id: 1, cityA: 0, cityB: 1, points: 8, complete: false, ...overrides };
}

describe("Train Time recap adapter", () => {
    it("turns a claim into one row carrying the track laid and the points", () => {
        const [event] = events(
            state([ALICE, BOB]),
            state([player({ ...ALICE, routesClaimed: 1, longestRun: ROUTE.length }), BOB]),
            cmd({ className: "TrainTimeClaimRoute", ...{ routeId: ROUTE.id } } as never),
        );

        expect(event.title).toBe(`Alice claimed ${routeName(ROUTE)}`);
        expect(event.detail).toContain(`+${routeScore(ROUTE.length)}`);
        // Claims are public, so the Long Haul lead is called out with them.
        expect(event.detail).toContain(`longest run now ${ROUTE.length}`);
    });

    it("leaves the Long Haul note off a claim that doesn't take the lead", () => {
        const [event] = events(
            state([ALICE, BOB]),
            state([player({ ...ALICE, longestRun: 2 }), player({ ...BOB, longestRun: 6 })]),
            cmd({ className: "TrainTimeClaimRoute", ...{ routeId: ROUTE.id } } as never),
        );
        expect(event.detail).not.toContain("longest run");
    });

    it("names a face-up card taken but never a card drawn blind", () => {
        const [faceUp] = events(
            state([ALICE, BOB]),
            state([ALICE, BOB]),
            cmd({ className: "TrainTimeDrawCarriageCard", ...{ source: "market", marketIndex: 1 } } as never),
        );
        expect(faceUp.title).toBe("Alice took the face-up Green");

        const [blind] = events(
            state([ALICE, BOB]),
            state([ALICE, BOB]),
            cmd({ className: "TrainTimeDrawCarriageCard", ...{ source: "deck", marketIndex: 0 } } as never),
        );
        expect(blind.title).toBe("Alice drew from the deck");
        expect(blind.detail).toBe("blind from the deck");
    });

    it("folds the two halves of one draw action into a single row", () => {
        const [drawA] = events(state([ALICE, BOB]), state([ALICE, BOB]), cmd({ className: "TrainTimeDrawCarriageCard", ...{ source: "market", marketIndex: 0 } } as never));
        const [drawB] = events(state([ALICE, BOB]), state([ALICE, BOB]), cmd({ id: "c2", className: "TrainTimeDrawCarriageCard", ...{ source: "deck", marketIndex: 0 } } as never));

        const merged = trainTimeRecapAdapter.postProcess!([drawA, drawB]);
        expect(merged).toHaveLength(1);
        expect(merged[0].title).toBe("Alice drew 2 cards");
        expect(merged[0].detail).toBe("face-up Red · blind from the deck");
    });

    it("keeps a third draw as its own row — that's a second turn, not a third card", () => {
        const draw = (id: string) => events(
            state([ALICE, BOB]),
            state([ALICE, BOB]),
            cmd({ id, className: "TrainTimeDrawCarriageCard", ...{ source: "deck", marketIndex: 0 } } as never),
        )[0];

        const merged = trainTimeRecapAdapter.postProcess!([draw("c1"), draw("c2"), draw("c3")]);
        expect(merged.map(e => e.title)).toEqual(["Alice drew 2 cards", "Alice drew from the deck"]);
    });

    it("reports how many tickets stuck, never which ones", () => {
        const [event] = events(
            state([player({ ...ALICE, ticketCount: 2 }), BOB]),
            state([player({ ...ALICE, ticketCount: 4 }), BOB]),
            cmd({ className: "TrainTimeKeepTickets", ...{ keep: [3, 7] } } as never),
        );
        expect(event.title).toBe("Alice drew destination tickets");
        expect(event.detail).toBe("kept 2 tickets");
    });

    it("says nothing about the opening ticket deal — it isn't a turn", () => {
        expect(events(
            state([player({ ...ALICE, ticketCount: 0 }), BOB]),
            state([player({ ...ALICE, ticketCount: 2 }), BOB]),
            cmd({ className: "TrainTimeKeepTickets", ...{ keep: [3, 7] } } as never),
        )).toEqual([]);
    });

    it("calls the last lap, and marks it as affecting everybody", () => {
        const rows = events(
            state([ALICE, BOB]),
            state([player({ ...ALICE, trains: 2 }), BOB], { finalRoundPending: ["Alice", "Bob"] }),
            cmd({ className: "TrainTimeClaimRoute", ...{ routeId: ROUTE.id } } as never),
        );

        const lastLap = rows.find(e => e.glyph === "⏳")!;
        expect(lastLap.title).toBe("Last lap — everyone gets one more turn");
        expect(lastLap.detail).toBe("Alice is down to 2 trains");
        expect(lastLap.affectedIds).toEqual(["u1", "u2"]);
        // …alongside the claim that tripped it, and with a distinct id so the
        // two rows can be reacted to separately.
        expect(rows).toHaveLength(2);
        expect(new Set(rows.map(e => e.id)).size).toBe(2);
    });

    it("summarises the moves missed, and leads with the last lap when it started", () => {
        const claim = events(state([ALICE, BOB]), state([ALICE, BOB]), cmd({ className: "TrainTimeClaimRoute", ...{ routeId: ROUTE.id } } as never));
        expect(trainTimeRecapAdapter.summarize(claim, "u2").subline)
            .toBe("1 move happened while you were away — a rival took a route off the board.");

        const withLastLap = events(
            state([ALICE, BOB]),
            state([ALICE, BOB], { finalRoundPending: ["Alice", "Bob"] }),
            cmd({ className: "TrainTimeClaimRoute", ...{ routeId: ROUTE.id } } as never),
        );
        const summary = trainTimeRecapAdapter.summarize(withLastLap, "u2");
        expect(summary.headline).toBe("Your move again 👋");
        // The last lap is the news, and it isn't itself one of the moves.
        expect(summary.subline).toContain("1 move happened");
        expect(summary.subline).toContain("last lap");
    });
});

describe("Train Time recap tip", () => {
    const tip = (gs: ITrainTimeSpecificGameStateResponse) => trainTimeRecapAdapter.tip!(gs, "u1");

    it("puts tickets on the table ahead of everything else", () => {
        expect(tip(state([ALICE, BOB], { myPendingTickets: [ticket()] }))!.text)
            .toContain("tickets on the table");
    });

    it("names the best route the player's hand already pays for", () => {
        const hand = Array.from({ length: 6 }, () => "engine" as const);
        const result = tip(state([ALICE, BOB], { myHand: hand }))!;
        // Locos are wild, so a full hand of them pays for the board's best route.
        const best = ROUTES.filter(r => r.length <= hand.length)
            .reduce((a, b) => (routeScore(b.length) > routeScore(a.length) ? b : a));
        expect(result.text).toContain(routeName(best));
    });

    it("points at the ticket still unconnected when nothing is payable", () => {
        const result = tip(state([ALICE, BOB], {
            myHand: [],
            myTickets: [ticket({ points: 4 }), ticket({ id: 2, cityA: 2, cityB: 3, points: 11 })],
        }))!;
        expect(result.text).toContain("11");
    });

    it("has nothing to say about a player who isn't in the game", () => {
        expect(trainTimeRecapAdapter.tip!(state([BOB]), "u1")).toBeNull();
    });
});
