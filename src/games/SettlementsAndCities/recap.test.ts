import { describe, expect, it } from "vitest";
import { settlementsAndCitiesRecapAdapter } from "./recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { ISACSpecificGameStateResponse, ISACPlayerStateResponse } from "./apiModels";
import type { ISACRollChange, SAC_Resource } from "./board";
import { NO_RESOURCES } from "./board";

function player(overrides: Partial<ISACPlayerStateResponse> & { userId: string; username: string }): ISACPlayerStateResponse {
    // Fixtures describe a hand as its composition, the way the game state holds
    // it; the response's public count is derived from that, same as the server
    // does — so a test that hands someone 3 wool also gives them 3 cards.
    const resources = overrides.resources ?? NO_RESOURCES;
    return {
        resourceCount: Object.values(resources).reduce((sum, n) => sum + n, 0),
        resources,
        devCardCount: 0,
        knightsPlayed: 0,
        resourcesGathered: 0,
        remainingRoads: 15,
        remainingSettlements: 5,
        remainingCities: 4,
        visibleVP: 0,
        ...overrides,
    };
}

function state(players: ISACPlayerStateResponse[], overrides: Partial<ISACSpecificGameStateResponse> = {}): ISACSpecificGameStateResponse {
    const playerStates: { [userId: string]: ISACPlayerStateResponse } = {};
    for (const p of players) playerStates[p.userId] = p;
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
        lastRollDie1: null,
        lastRollDie2: null,
        lastRollChanges: [],
        pendingRobber: false,
        longestRoadOwner: null,
        largestArmyOwner: null,
        devCardDeckSize: 25,
        pendingRoadBuilding: 0,
        playedDevCard: false,
        playerDevCards: {},
        playerNewDevCards: {},
        specialBuildActive: false,
        specialBuildQueue: [],
        specialBuildMainPlayer: null,
        expansions: {} as ISACSpecificGameStateResponse["expansions"],
        victoryTarget: 10,
        ...overrides,
    };
}

// One player's side of a roll, naming only the resources the roll paid them.
function gain(userId: string, gained: Partial<Record<SAC_Resource, number>>): ISACRollChange {
    return { userId, gained: { ...NO_RESOURCES, ...gained }, discarded: 0 };
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
    it("names the resources a roll dealt out, per player", () => {
        const prev = state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob" })]);
        const next = state(
            [player({ userId: "u1", username: "Alice", resources: { lumber: 2, wool: 0, grain: 1, brick: 0, ore: 0 } }), player({ userId: "u2", username: "Bob", resources: { lumber: 0, wool: 0, grain: 0, brick: 0, ore: 1 } })],
            {
                lastRoll: 8,
                lastRollChanges: [
                    gain("u1", { lumber: 2, grain: 1 }),
                    gain("u2", { ore: 1 }),
                ],
            },
        );
        const events = settlementsAndCitiesRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "SACRollDice" }), OK);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("sac_roll");
        expect(events[0].title).toBe("Alice rolled a 8");
        // Named rather than netted, and nobody is "You" — every player reads the
        // same recap.
        expect(events[0].detail).toBe("Alice +2🪵 +1🌾, Bob +1⛏️");
        expect(events[0].affectedIds).toEqual(["u1", "u2"]);
    });

    it("says a roll paid nobody when it paid nobody", () => {
        const st = state([player({ userId: "u1", username: "Alice" })], { lastRoll: 8, lastRollChanges: [] });
        const events = settlementsAndCitiesRecapAdapter.toEvents(snap(st), snap(st), cmd({ className: "SACRollDice" }), OK);
        expect(events[0].detail).toBe("no one collected");
        expect(events[0].affectedIds).toEqual([]);
    });

    it("leaves the payout line off a roll from a game older than the field", () => {
        const st = state([player({ userId: "u1", username: "Alice" })], { lastRoll: 8, lastRollChanges: undefined });
        const events = settlementsAndCitiesRecapAdapter.toEvents(snap(st), snap(st), cmd({ className: "SACRollDice" }), OK);
        expect(events[0].title).toBe("Alice rolled a 8");
        expect(events[0].detail).toBeUndefined();
    });

    it("counts the cards a 7 took off each player, never which ones", () => {
        const prev = state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob", resources: { lumber: 8, wool: 0, grain: 0, brick: 0, ore: 0 } })]);
        const next = state(
            [player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob", resources: { lumber: 4, wool: 0, grain: 0, brick: 0, ore: 0 } })],
            { lastRoll: 7, lastRollChanges: [{ userId: "u2", gained: NO_RESOURCES, discarded: 4 }] },
        );
        const events = settlementsAndCitiesRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "SACRollDice" }), OK);
        expect(events[0].type).toBe("sac_roll_seven");
        expect(events[0].title).toBe("Alice rolled a 7");
        expect(events[0].detail).toBe("robber stirs · Bob −4 cards");
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
        const prev = state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob" })], { longestRoadOwner: "u2" });
        const next = state([player({ userId: "u1", username: "Alice" }), player({ userId: "u2", username: "Bob" })], { longestRoadOwner: "u1" });
        const events = settlementsAndCitiesRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "SACBuildRoad" }), OK);
        // Road builds are otherwise silent — only the handover surfaces.
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("sac_longest_road");
        expect(events[0].title).toContain("Longest Road");
        expect(events[0].affectedIds).toEqual(["u2"]);
        // The copy names the previous holder, not their userId.
        expect(events[0].detail).toContain("Bob");
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
