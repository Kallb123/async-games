import { describe, expect, it } from "vitest";
import { settlementsAndCitiesRecapAdapter } from "./recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { ISACSpecificGameStateResponse, ISACPlayerStateResponse } from "./apiModels";
import type { SAC_Resource } from "./board";

function player(overrides: Partial<ISACPlayerStateResponse> & { userId: string; username: string }): ISACPlayerStateResponse {
    return {
        resources: { lumber: 0, wool: 0, grain: 0, brick: 0, ore: 0 },
        devCardCount: 0,
        knightsPlayed: 0,
        remainingRoads: 15,
        remainingSettlements: 5,
        remainingCities: 4,
        visibleVP: 0,
        ...overrides,
    };
}

function state(players: ISACPlayerStateResponse[], overrides: Partial<ISACSpecificGameStateResponse> = {}): ISACSpecificGameStateResponse {
    const playerStates: { [username: string]: ISACPlayerStateResponse } = {};
    for (const p of players) playerStates[p.username] = p;
    return {
        hexes: [], vertices: [], edges: [], harbors: [],
        playerStates,
        robberHexIndex: 0,
        phase: "main",
        setupStep: 0,
        pendingRoadSetup: false,
        lastSetupSettlementVertex: null,
        hasRolled: false,
        lastRoll: null,
        pendingRobber: false,
        longestRoadOwner: null,
        largestArmyOwner: null,
        devCardDeckSize: 25,
        pendingRoadBuilding: 0,
        playedDevCard: false,
        playerDevCards: {},
        specialBuildActive: false,
        specialBuildQueue: [],
        specialBuildMainPlayer: null,
        expansions: {} as ISACSpecificGameStateResponse["expansions"],
        victoryTarget: 10,
        ...overrides,
    };
}

function snap(gs: ISACSpecificGameStateResponse): ITurnSnapshot {
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

const OK = { validMove: true, turnOver: false } as ICommandOutcome;

describe("Settlements & Cities recap adapter", () => {
    it("flags who collected on a resource roll", () => {
        const prev = state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob" })]);
        const next = state(
            [player({ userId: "u1", username: "Alice", resources: { lumber: 2, wool: 0, grain: 0, brick: 0, ore: 0 } }), player({ userId: "u2", username: "Bob" })],
            { lastRoll: 8 },
        );
        const events = settlementsAndCitiesRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "SACRollDice" }), OK);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("sac_roll");
        expect(events[0].title).toBe("Alice rolled a 8");
        expect(events[0].affectedIds).toEqual(["u1"]);
    });

    it("marks discards on a 7 for players who lost cards", () => {
        const prev = state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob", resources: { lumber: 8, wool: 0, grain: 0, brick: 0, ore: 0 } })]);
        const next = state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob", resources: { lumber: 4, wool: 0, grain: 0, brick: 0, ore: 0 } })], { lastRoll: 7 });
        const events = settlementsAndCitiesRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "SACRollDice" }), OK);
        expect(events[0].type).toBe("sac_roll_seven");
        expect(events[0].title).toBe("Alice rolled a 7");
        expect(events[0].affectedIds).toEqual(["u2"]);
    });

    it("attributes a robber steal to its victim", () => {
        const st = state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob" })]);
        const events = settlementsAndCitiesRecapAdapter.toEvents(
            snap(st), snap(st),
            cmd({ className: "SACMoveRobber", stealFromUserId: "u2" } as Partial<IGameCommand> & { className: string }),
            OK,
        );
        expect(events[0].type).toBe("sac_robber");
        expect(events[0].detail).toBe("from Bob");
        expect(events[0].affectedIds).toEqual(["u2"]);
    });

    it("reports a city build with the builder's new VP", () => {
        const prev = state([player({ userId: "u1", username: "Alice", visibleVP: 3 })]);
        const next = state([player({ userId: "u1", username: "Alice", visibleVP: 4 })]);
        const events = settlementsAndCitiesRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "SACBuildCity" }), OK);
        expect(events[0].type).toBe("sac_city");
        expect(events[0].detail).toBe("4 VP");
    });

    it("emits a bonus-handover event when longest road changes hands", () => {
        const prev = state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob" })], { longestRoadOwner: "Bob" });
        const next = state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob" })], { longestRoadOwner: "Alice" });
        const events = settlementsAndCitiesRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "SACBuildRoad" }), OK);
        // Road builds are otherwise silent — only the handover surfaces.
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("sac_longest_road");
        expect(events[0].title).toContain("Longest Road");
        expect(events[0].affectedIds).toEqual(["u2"]);
    });

    it("flags players a monopoly stole from", () => {
        const prev = state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob", resources: { lumber: 0, wool: 3, grain: 0, brick: 0, ore: 0 } })]);
        const next = state([player({ userId: "u1", username: "Alice", resources: { lumber: 0, wool: 3, grain: 0, brick: 0, ore: 0 } }), player({ userId: "u2", username: "Bob" })]);
        const events = settlementsAndCitiesRecapAdapter.toEvents(
            snap(prev), snap(next),
            cmd({ className: "SACPlayMonopoly", resource: "wool" as SAC_Resource } as Partial<IGameCommand> & { className: string }),
            OK,
        );
        expect(events[0].type).toBe("sac_monopoly");
        expect(events[0].affectedIds).toEqual(["u2"]);
    });

    it("stays silent for trades and end-turn", () => {
        for (const className of ["SACMaritimeTrade", "SACEndTurn", "SACPlaceSettlementSetup"]) {
            const st = state([player({ userId: "u1", username: "Alice" })]);
            expect(settlementsAndCitiesRecapAdapter.toEvents(snap(st), snap(st), cmd({ className }), OK)).toEqual([]);
        }
    });

    it("personalises the summary when the robber hit the viewer", () => {
        const summary = settlementsAndCitiesRecapAdapter.summarize(
            [
                { id: "a", commandId: "a", timestamp: "", actorId: "u2", actorUsername: "Bob", type: "sac_roll", title: "Bob rolled a 6" },
                { id: "b", commandId: "b", timestamp: "", actorId: "u2", actorUsername: "Bob", type: "sac_robber", title: "Bob moved the robber and stole a card", affectedIds: ["u1"] },
            ],
            "u1",
        );
        expect(summary.subline).toContain("robber paid you a visit");
    });

    it("tips toward the best affordable build", () => {
        const city = settlementsAndCitiesRecapAdapter.tip!(
            state([player({ userId: "u1", username: "Alice", resources: { lumber: 0, wool: 0, grain: 2, brick: 0, ore: 3 } })]),
            "u1",
        );
        expect(city?.text).toContain("city");

        const vp = settlementsAndCitiesRecapAdapter.tip!(
            state([player({ userId: "u1", username: "Alice", visibleVP: 6 })]),
            "u1",
        );
        expect(vp?.text).toContain("4 more");
    });
});
