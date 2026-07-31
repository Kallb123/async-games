import { describe, expect, it } from "vitest";
import { diceCitiesRecapAdapter } from "./recap";
import { BANK_TOTAL_COINS, DiceCitiesCardIds } from "./cards";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { IDiceCitiesGameStateResponse, IDiceCitiesPlayerStateResponse } from "./apiModels";

function player(overrides: Partial<IDiceCitiesPlayerStateResponse> & { userId: string; username: string }): IDiceCitiesPlayerStateResponse {
    return {
        cards: [],
        money: 0,
        totalCoinsEarned: 0,
        doubleUnlocked: false,
        bonusDiningAndStore: false,
        rerollDoubles: false,
        oneReroll: false,
        harbourUnlocked: false,
        lastDiceSelection: 1,
        ...overrides,
    };
}

function state(players: IDiceCitiesPlayerStateResponse[]): IDiceCitiesGameStateResponse {
    const playerStates: { [key: string]: IDiceCitiesPlayerStateResponse } = {};
    for (const p of players) playerStates[p.username] = p;
    return {
        bankCards: [],
        bankMoney: BANK_TOTAL_COINS,
        playerStates,
        hasRolled: false,
        awaitingTSSelection: false,
        awaitingBCSelectionOwn: false,
        awaitingBCSelectionOpponent: false,
        bcSelectedOwnCard: null,
        bcSelectedOpponent: null,
        bcSelectedOpponentCard: null,
        awaitingDoubleReroll: false,
        hasReRolled: false,
        awaitingHarbourChoice: false,
        harbourRoll1: null,
        harbourRoll2: null,
    };
}

function snap(gs: IDiceCitiesGameStateResponse): ITurnSnapshot {
    return { index: 0, specificGameState: gs, currentTurn: "", complete: false, winner: "", history: [], command: null, planned: false };
}

function cmd(overrides: Partial<IGameCommand> & { className: string }): IGameCommand {
    return {
        id: "c1",
        timestamp: "2026-07-21T09:00:00.000Z",
        senderId: "u1",
        senderUsername: "Alice",
        ...overrides,
    } as unknown as IGameCommand;
}

describe("Dice Cities recap adapter", () => {
    it("turns a dice roll into a single roll event with the roller's net money and affected players", () => {
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([player({ userId: "u1", username: "Alice" })])),
            snap(state([player({ userId: "u1", username: "Alice" })])),
            cmd({ className: "DiceCitiesRequestDiceRoll" }),
            { validMove: true, turnOver: false, roll1: 3, roll2: null, moneyChanges: new Map([["u1", 2], ["u2", -2]]) } as ICommandOutcome,
        );
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("dc_roll");
        expect(events[0].title).toBe("Alice rolled 3");
        expect(events[0].detail).toBe("+2🪙");
        expect(events[0].affectedIds).toEqual(["u1", "u2"]);
    });

    it("shows both dice for a double roll", () => {
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([])),
            cmd({ className: "DiceCitiesRequestDiceRoll" }),
            { validMove: true, turnOver: false, roll1: 4, roll2: 5, moneyChanges: new Map() } as ICommandOutcome,
        );
        expect(events[0].title).toBe("Alice rolled 9 (4+5)");
        expect(events[0].detail).toBe("no coins");
    });

    it("reports landmark progress, and a win on the fourth", () => {
        const oneBuilt = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([player({ userId: "u1", username: "Alice", doubleUnlocked: true })])),
            cmd({ className: "DiceCitiesRequestUnlockTrainStation" }),
            { validMove: true, turnOver: true } as ICommandOutcome,
        );
        expect(oneBuilt[0].type).toBe("dc_landmark");
        expect(oneBuilt[0].title).toContain("Train Station");
        expect(oneBuilt[0].detail).toBe("1/4 landmarks");

        const allFour = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([player({ userId: "u1", username: "Alice", doubleUnlocked: true, bonusDiningAndStore: true, oneReroll: true, rerollDoubles: true })])),
            cmd({ className: "DiceCitiesRequestUnlockRadioTower" }),
            { validMove: true, turnOver: true } as ICommandOutcome,
        );
        expect(allFour[0].detail).toBe("winner!");
        expect(allFour[0].glyph).toBe("🏆");
    });

    it("names the establishment bought", () => {
        const events = diceCitiesRecapAdapter.toEvents(
            snap(state([])),
            snap(state([])),
            cmd({ className: "DiceCitiesRequestCardPurchase", cardId: DiceCitiesCardIds.CAFE } as Partial<IGameCommand> & { className: string }),
            { validMove: true, turnOver: true } as ICommandOutcome,
        );
        expect(events[0].type).toBe("dc_buy");
        expect(events[0].title).toBe("Alice bought a Cafe");
        expect(events[0].detail).toBe("2🪙");
    });

    it("stays silent for passes and mid-roll selections", () => {
        for (const className of ["DiceCitiesRequestPassTurn", "DiceCitiesRequestTvStationSelection", "DiceCitiesRequestBusinessCenterOwnSelection"]) {
            expect(
                diceCitiesRecapAdapter.toEvents(snap(state([])), snap(state([])), cmd({ className }), { validMove: true, turnOver: false } as ICommandOutcome),
            ).toEqual([]);
        }
    });

    it("tips the viewer toward the cheapest landmark they can afford", () => {
        const canAfford = diceCitiesRecapAdapter.tip!(state([player({ userId: "u1", username: "Alice", money: 5 })]), "u1");
        expect(canAfford?.text).toContain("Train Station");
        expect(canAfford?.text).toContain("enough");

        const cannotAfford = diceCitiesRecapAdapter.tip!(state([player({ userId: "u1", username: "Alice", money: 1 })]), "u1");
        expect(cannotAfford?.text).toContain("save 3 more");
    });
});
