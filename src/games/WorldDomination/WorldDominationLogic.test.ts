import { describe, expect, it } from "vitest";
import {
    WorldDominationGameType,
    WorldDominationDeployArmies,
    WorldDominationCashInCards,
    WorldDominationAttack,
    WorldDominationOccupyTerritory,
    WorldDominationEndAttackPhase,
    WorldDominationFortify,
    WorldDominationSkipFortify,
    type IWorldDominationAttackOutcome,
} from "./WorldDominationLogic";
import {
    TERRITORY_COUNT,
    computeReinforcement,
    cardSetValue,
    isValidCardSet,
    territoryIdsForContinent,
    type IWorldDominationTerritory,
    type IWorldDominationCard,
} from "./board";
import type { IWorldDominationSpecificGameState, IWorldDominationGameData } from "./WorldDominationModels";
import { makeState, makeTerritories, player } from "./testFixtures";

// ─── Minimal in-memory game harness ────────────────────────────────────────

function makeGame(gs: IWorldDominationSpecificGameState, currentTurn = "u1"): IWorldDominationGameData {
    return {
        currentTurn,
        userIdList: ["u1", "u2"],
        gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
        specificGameState: gs,
        initialSpecificGameState: gs,
        complete: false,
        winner: "",
    } as unknown as IWorldDominationGameData;
}

function cmd<T extends { senderId: string; senderUsername: string }>(c: T, sender = "u1"): T {
    c.senderId = sender;
    c.senderUsername = sender === "u1" ? "Alice" : "Bob";
    return c;
}

function card(id: string, type: IWorldDominationCard["type"], territoryId: number | null = null): IWorldDominationCard {
    return { id, type, territoryId };
}

describe("WorldDominationDeployArmies", () => {
    it("rejects deploying more than the remaining pool", async () => {
        const gs = makeState({ phase: "setup", reinforcementsRemaining: 3 });
        const game = makeGame(gs);
        const c = cmd(new WorldDominationDeployArmies());
        c.territoryId = 0;
        c.count = 5;
        const outcome = await c.Execute(game);
        expect(outcome.validMove).toBe(false);
    });

    it("places armies and ends the setup turn once the pool empties", async () => {
        const gs = makeState({ phase: "setup", reinforcementsRemaining: 2 });
        const game = makeGame(gs);
        const c = cmd(new WorldDominationDeployArmies());
        c.territoryId = 0;
        c.count = 2;
        const outcome = await c.Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(outcome.turnOver).toBe(true);
        expect(gs.territories[0].armies).toBe(5);
        expect(gs.reinforcementsRemaining).toBe(0);
    });

    it("auto-advances Reinforce into Attack once the pool empties (no turnOver)", async () => {
        const gs = makeState({ phase: "reinforce", reinforcementsRemaining: 1 });
        const game = makeGame(gs);
        const c = cmd(new WorldDominationDeployArmies());
        c.territoryId = 0;
        c.count = 1;
        const outcome = await c.Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(outcome.turnOver).toBe(false);
        expect(gs.phase).toBe("attack");
    });

    it("blocks deploys while holding 5+ cards (mandatory cash-in)", async () => {
        const cards = [card("a", "infantry"), card("b", "infantry"), card("c", "infantry"), card("d", "cavalry"), card("e", "cavalry")];
        const gs = makeState({ phase: "reinforce", reinforcementsRemaining: 3, playerStates: new Map([["u1", player({ cards })], ["u2", player()]]) });
        const game = makeGame(gs);
        const c = cmd(new WorldDominationDeployArmies());
        c.territoryId = 0;
        c.count = 1;
        const outcome = await c.Execute(game);
        expect(outcome.validMove).toBe(false);
    });
});

describe("reinforcement maths", () => {
    it("grants the continent bonus only when every territory in it is owned", () => {
        const territories = makeTerritories("u2");
        const australiaIds = territoryIdsForContinent("australia");
        australiaIds.forEach(id => { territories[id] = { owner: "u1", armies: 1 }; });
        // 4 territories owned -> base 3, +2 Australia bonus.
        expect(computeReinforcement("u1", territories)).toBe(5);

        // Losing one Australian territory drops the continent bonus.
        territories[australiaIds[0]] = { owner: "u2", armies: 1 };
        expect(computeReinforcement("u1", territories)).toBe(3);
    });
});

describe("WorldDominationCashInCards", () => {
    it("validates card sets per docs/games/worlddomination.md §4.1", () => {
        expect(isValidCardSet([card("1", "infantry"), card("2", "infantry"), card("3", "infantry")])).toBe(true);
        expect(isValidCardSet([card("1", "infantry"), card("2", "cavalry"), card("3", "artillery")])).toBe(true);
        expect(isValidCardSet([card("1", "infantry"), card("2", "infantry"), card("3", "cavalry")])).toBe(false);
        expect(isValidCardSet([card("1", "infantry"), card("2", "cavalry"), card("3", "wild")])).toBe(true);
    });

    it("follows the progressive value table", () => {
        expect([0, 1, 2, 3, 4, 5, 6].map(cardSetValue)).toEqual([4, 6, 8, 10, 15, 20, 25]);
    });

    it("cashes in a set for armies and applies the territory match bonus", async () => {
        const cards = [card("a", "infantry", 5), card("b", "infantry"), card("c", "infantry")];
        const territories = makeTerritories("u1");
        const gs = makeState({
            phase: "reinforce",
            territories,
            playerStates: new Map([["u1", player({ cards })], ["u2", player()]]),
        });
        const game = makeGame(gs);
        const c = cmd(new WorldDominationCashInCards());
        c.cardIds = ["a", "b", "c"];
        const outcome = await c.Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(gs.reinforcementsRemaining).toBe(4);
        expect(gs.territories[5].armies).toBe(5); // 3 base + 2 match bonus
        expect(gs.playerStates.get("u1")!.cards).toHaveLength(0);
    });
});

describe("WorldDominationAttack", () => {
    it("resolves a roll, conquers the territory, and requires occupation before further attacks", async () => {
        const territories = makeTerritories("u1", {
            0: { owner: "u1", armies: 5 }, // Alaska
            29: { owner: "u2", armies: 1 }, // Kamchatka (adjacent to Alaska)
        });
        const gs = makeState({ phase: "attack", territories });
        const game = makeGame(gs);
        const c = cmd(new WorldDominationAttack());
        c.fromTerritoryId = 0;
        c.toTerritoryId = 29;
        c.attackerDiceCount = 1;
        c.recordedAttackerDice = [6];
        c.recordedDefenderDice = [1];
        const outcome = await c.Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(gs.territories[29].owner).toBe("u1");
        expect(gs.pendingOccupation).not.toBeNull();
        expect(gs.pendingOccupation!.minArmies).toBe(1);

        // Further attacks are blocked until the conquered territory is occupied.
        const blocked = cmd(new WorldDominationAttack());
        blocked.fromTerritoryId = 0;
        blocked.toTerritoryId = 29;
        blocked.attackerDiceCount = 1;
        expect((await blocked.Execute(game)).validMove).toBe(false);
    });

    it("eliminates a defender who loses their last territory and hands over their cards", async () => {
        const territories = makeTerritories("u1", {
            0: { owner: "u1", armies: 5 },
            29: { owner: "u2", armies: 1 }, // u2's only territory
        });
        const defenderCards = [card("x", "infantry")];
        const gs = makeState({
            phase: "attack",
            territories,
            playerStates: new Map([["u1", player()], ["u2", player({ cards: defenderCards })]]),
        });
        const game = makeGame(gs);
        const c = cmd(new WorldDominationAttack());
        c.fromTerritoryId = 0;
        c.toTerritoryId = 29;
        c.attackerDiceCount = 1;
        c.recordedAttackerDice = [6];
        c.recordedDefenderDice = [1];
        const outcome = await c.Execute(game) as IWorldDominationAttackOutcome;
        expect(outcome.defenderEliminated).toBe("u2");
        expect(gs.playerStates.get("u2")!.eliminated).toBe(true);
        expect(gs.playerStates.get("u1")!.cards.map((cc: IWorldDominationCard) => cc.id)).toEqual(["x"]);
        expect(gs.playerStates.get("u2")!.cards).toHaveLength(0);

        expect(new WorldDominationGameType().CheckGameOver(game)).toBe(true);
        expect(game.winner).toBe("u1");
    });
});

describe("WorldDominationOccupyTerritory", () => {
    it("moves the minimum-or-more armies in and clears the pending occupation", async () => {
        const territories = makeTerritories("u1", {
            0: { owner: "u1", armies: 4 },
            29: { owner: "u1", armies: 2 },
        });
        const gs = makeState({
            phase: "attack",
            territories,
            pendingOccupation: { fromTerritoryId: 0, toTerritoryId: 29, minArmies: 2 },
        });
        const game = makeGame(gs);
        const c = cmd(new WorldDominationOccupyTerritory());
        c.armies = 3;
        const outcome = await c.Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(gs.territories[0].armies).toBe(1);
        expect(gs.territories[29].armies).toBe(3);
        expect(gs.pendingOccupation).toBeNull();
    });
});

describe("WorldDominationEndAttackPhase / WorldDominationFortify / WorldDominationSkipFortify", () => {
    it("moves from Attack to Fortify only once reinforcements are placed and no cash-in is owed", async () => {
        const gs = makeState({ phase: "attack", reinforcementsRemaining: 1 });
        const game = makeGame(gs);
        expect((await cmd(new WorldDominationEndAttackPhase()).Execute(game)).validMove).toBe(false);
        gs.reinforcementsRemaining = 0;
        const outcome = await cmd(new WorldDominationEndAttackPhase()).Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(gs.phase).toBe("fortify");
    });

    it("fortifies only along a chain of owned territories, and ends the turn", async () => {
        // Alaska(0) -> Northwest Territory(1) -> Ontario(4): 0 and 4 aren't
        // directly adjacent, so this only works if territory 1 is also owned.
        const territories = makeTerritories("u2", {
            0: { owner: "u1", armies: 4 },
            1: { owner: "u1", armies: 1 },
            4: { owner: "u1", armies: 1 },
        });
        const gs = makeState({ phase: "fortify", territories });
        const game = makeGame(gs);
        const c = cmd(new WorldDominationFortify());
        c.fromTerritoryId = 0;
        c.toTerritoryId = 4;
        c.armies = 2;
        const outcome = await c.Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(outcome.turnOver).toBe(true);
        expect(gs.territories[0].armies).toBe(2);
        expect(gs.territories[4].armies).toBe(3);
    });

    it("rejects fortifying through territory it doesn't own", async () => {
        const territories = makeTerritories("u2", {
            0: { owner: "u1", armies: 4 },
            4: { owner: "u1", armies: 1 }, // not connected: Northwest Territory(1) between them is u2's
        });
        const gs = makeState({ phase: "fortify", territories });
        const game = makeGame(gs);
        const c = cmd(new WorldDominationFortify());
        c.fromTerritoryId = 0;
        c.toTerritoryId = 4;
        c.armies = 1;
        expect((await c.Execute(game)).validMove).toBe(false);
    });

    it("skipping fortify ends the turn without moving armies", async () => {
        const gs = makeState({ phase: "fortify" });
        const game = makeGame(gs);
        const outcome = await cmd(new WorldDominationSkipFortify()).Execute(game);
        expect(outcome.validMove).toBe(true);
        expect(outcome.turnOver).toBe(true);
    });
});

describe("WorldDominationGameType turn flow", () => {
    it("advances setup through every player before starting Turn 1's Reinforce phase", () => {
        const gs = makeState({ phase: "setup", reinforcementsRemaining: 0 });
        const game = makeGame(gs, "u1");
        const gameType = new WorldDominationGameType();
        gameType.CheckEndTurn(game, { validMove: true, turnOver: true });
        expect(game.currentTurn).toBe("u2");
        expect(gs.phase).toBe("setup");

        gameType.CheckEndTurn(game, { validMove: true, turnOver: true });
        expect(game.currentTurn).toBe("u1");
        expect(gs.phase).toBe("reinforce");
    });

    it("draws a card at end of turn only if a territory was conquered", () => {
        const gs = makeState({
            phase: "fortify",
            cardDeck: [card("d1", "infantry")],
            playerStates: new Map([["u1", player({ conqueredTerritoryThisTurn: true })], ["u2", player()]]),
        });
        const game = makeGame(gs, "u1");
        new WorldDominationGameType().CheckEndTurn(game, { validMove: true, turnOver: true });
        expect(gs.playerStates.get("u1")!.cards).toHaveLength(1);
        expect(gs.phase).toBe("reinforce");
        expect(game.currentTurn).toBe("u2");
    });
});
