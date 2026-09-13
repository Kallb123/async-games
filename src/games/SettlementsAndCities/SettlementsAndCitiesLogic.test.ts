import { describe, expect, it } from "vitest";
import {
    SettlementsAndCitiesGameType,
    SACBuyDevCard,
    SACPlayKnight,
    SACPlayRoadBuilding,
    SACPlayYearOfPlenty,
    SACPlayMonopoly,
    SACRollDice,
    SACMoveRobber,
    SACEndTurn,
} from "./SettlementsAndCitiesLogic";
import * as SACLogic from "./SettlementsAndCitiesLogic";
import { makeState, player } from "./testFixtures";
import { BOARD_TOPOLOGY } from "./board";
import type { ISACSpecificGameState, ISACPlayerState, SAC_DevCard } from "./board";
import type { ISettlementsAndCitiesGameData } from "./SettlementsAndCitiesModels";
import type { IGameData } from "@/utils/mongodb/GameData";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";
import { resolveTokens } from "@/utils/games/history";

// ─── Minimal in-memory game harness ───────────────────────────────────────────
// The dev-card commands only touch playerStates + a handful of scalar flags, so
// we build a bare main-phase state rather than a full board.

function makeGame(gs: ISACSpecificGameState, currentTurn = "u1"): ISettlementsAndCitiesGameData {
    return {
        currentTurn,
        userIdList: ["u1", "u2"],
        gameState: { turnOrder: ["u1", "u2"], history: [], commandHistory: [] },
        specificGameState: gs,
        complete: false,
        winner: "",
    } as unknown as ISettlementsAndCitiesGameData;
}

function cmd<T extends { senderId: string; senderUsername: string }>(c: T, sender = "u1"): T {
    c.senderId = sender;
    c.senderUsername = sender === "u1" ? "Alice" : "Bob";
    return c;
}

describe("Settlements & Cities — development cards", () => {
    it("buys a dev card: pays 🐑🌾⛏️ and adds to the not-yet-playable pile", async () => {
        const p = player({ resources: { lumber: 0, wool: 1, grain: 1, brick: 0, ore: 1 } });
        const gs = makeState({ devCardDeck: ["knight" as SAC_DevCard] });
        gs.playerStates.set("u1", p);
        const game = makeGame(gs);

        const outcome = await cmd(new SACBuyDevCard()).Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(true);
        expect(p.resources).toMatchObject({ wool: 0, grain: 0, ore: 0 });
        expect(p.newDevCards.knight).toBe(1);
        expect(p.devCards.knight).toBe(0); // playable only next turn
        expect(gs.devCardDeck).toHaveLength(0);
    });

    it("rejects buying a dev card without the resources", async () => {
        const p = player({ resources: { lumber: 0, wool: 0, grain: 1, brick: 0, ore: 1 } });
        const gs = makeState({ devCardDeck: ["knight" as SAC_DevCard] });
        gs.playerStates.set("u1", p);
        const game = makeGame(gs);

        const outcome = await cmd(new SACBuyDevCard()).Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(false);
    });

    it("plays a Knight before the roll (pending robber, army grows)", async () => {
        const p = player({ devCards: { knight: 1 } as ISACPlayerState["devCards"] });
        const gs = makeState({ hasRolled: false });
        gs.playerStates.set("u1", p);
        const game = makeGame(gs);

        const outcome = await cmd(new SACPlayKnight()).Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(true);
        expect(p.devCards.knight).toBe(0);
        expect(p.knightsPlayed).toBe(1);
        expect(gs.pendingRobber).toBe(true);
        expect(gs.playedDevCard).toBe(true);
    });

    it("plays a Knight after the roll too", async () => {
        const p = player({ devCards: { knight: 1 } as ISACPlayerState["devCards"] });
        const gs = makeState({ hasRolled: true });
        gs.playerStates.set("u1", p);
        const game = makeGame(gs);

        const outcome = await cmd(new SACPlayKnight()).Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(true);
        expect(gs.pendingRobber).toBe(true);
    });

    it("enforces one development card per turn", async () => {
        const p = player({ devCards: { knight: 1, monopoly: 1 } as ISACPlayerState["devCards"] });
        const gs = makeState({ hasRolled: true });
        gs.playerStates.set("u1", p);
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        // First knight is fine; resolve the robber flag so it's not what blocks the second.
        expect((await cmd(new SACPlayKnight()).Execute(game as unknown as IGameData)).validMove).toBe(true);
        gs.pendingRobber = false;

        const second = await cmd(new SACPlayMonopoly()).Execute(game as unknown as IGameData);
        expect(second.validMove).toBe(false);
    });

    it("cannot play a Knight while a robber move is pending", async () => {
        const p = player({ devCards: { knight: 2 } as ISACPlayerState["devCards"] });
        const gs = makeState({ hasRolled: false, pendingRobber: true });
        gs.playerStates.set("u1", p);
        const game = makeGame(gs);

        const outcome = await cmd(new SACPlayKnight()).Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(false);
    });

    it("plays Year of Plenty for any two bank resources", async () => {
        const p = player({ devCards: { yearOfPlenty: 1 } as ISACPlayerState["devCards"] });
        const gs = makeState();
        gs.playerStates.set("u1", p);
        const game = makeGame(gs);

        const c = cmd(new SACPlayYearOfPlenty());
        c.resource1 = "ore";
        c.resource2 = "grain";
        const outcome = await c.Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(true);
        expect(p.resources.ore).toBe(1);
        expect(p.resources.grain).toBe(1);
        expect(p.devCards.yearOfPlenty).toBe(0);
    });

    it("plays Monopoly to sweep a resource from every other player", async () => {
        const me = player({ devCards: { monopoly: 1 } as ISACPlayerState["devCards"] });
        const bob = player({ resources: { lumber: 0, wool: 3, grain: 0, brick: 0, ore: 0 } });
        const gs = makeState();
        gs.playerStates.set("u1", me);
        gs.playerStates.set("u2", bob);
        const game = makeGame(gs);

        const c = cmd(new SACPlayMonopoly());
        c.resource = "wool";
        const outcome = await c.Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(true);
        expect(me.resources.wool).toBe(3);
        expect(bob.resources.wool).toBe(0);
    });

    it("plays Road Building to queue two free roads", async () => {
        const p = player({ devCards: { roadBuilding: 1 } as ISACPlayerState["devCards"] });
        const gs = makeState();
        gs.playerStates.set("u1", p);
        const game = makeGame(gs);

        const outcome = await cmd(new SACPlayRoadBuilding()).Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(true);
        expect(gs.pendingRoadBuilding).toBe(2);
        expect(p.devCards.roadBuilding).toBe(0);
    });
});

describe("Settlements & Cities — the dice roll", () => {
    // One producing hex is enough: BOARD_TOPOLOGY is the real 19-hex topology, so
    // hex 0's vertices are real vertex ids and a settlement on one of them
    // collects exactly as it would on a full board. The robber is parked
    // somewhere else so it isn't blocking the hex under test.
    function boardWithOneForest(numberToken: number): ISACSpecificGameState {
        const gs = makeState({
            robberHexIndex: 18,
            hexes: [{ terrain: "forest", numberToken }],
            vertices: Array.from({ length: BOARD_TOPOLOGY.numVertices }, () => ({ building: null, owner: null })),
            hasRolled: false,
            lastRoll: null,
        });
        return gs;
    }

    function rollOf(die1: number, die2: number): SACRollDice {
        const command = cmd(new SACRollDice());
        command.recordedRoll1 = die1;
        command.recordedRoll2 = die2;
        return command;
    }

    it("records what each player collected, and says so in the history", async () => {
        const gs = boardWithOneForest(8);
        const [aliceVertex, bobVertex] = BOARD_TOPOLOGY.hexVertices[0];
        gs.vertices[aliceVertex] = { building: "city", owner: "u1" };
        gs.vertices[bobVertex] = { building: "settlement", owner: "u2" };
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        const outcome = await rollOf(5, 3).Execute(game as unknown as IGameData);
        expect(outcome.validMove).toBe(true);
        // A city pays two, a settlement one.
        expect(gs.playerStates.get("u1")!.resources.lumber).toBe(2);
        expect(gs.playerStates.get("u2")!.resources.lumber).toBe(1);
        expect(gs.lastRollChanges).toEqual([
            { userId: "u1", gained: { lumber: 2, wool: 0, grain: 0, brick: 0, ore: 0 }, discarded: 0 },
            { userId: "u2", gained: { lumber: 1, wool: 0, grain: 0, brick: 0, ore: 0 }, discarded: 0 },
        ]);
        expect(game.gameState.history[0].text).toBe("{{u1}} rolled a 8 — {{u1}} +2🪵, {{u2}} +1🪵");
    });

    it("records a roll that paid nobody as exactly that", async () => {
        const gs = boardWithOneForest(8);
        gs.playerStates.set("u1", player());
        const game = makeGame(gs);

        await rollOf(5, 3).Execute(game as unknown as IGameData);
        expect(gs.lastRollChanges).toEqual([]);
        expect(game.gameState.history[0].text).toBe("{{u1}} rolled a 8 — nobody collected");
    });

    it("leaves a hex the robber is sitting on out of the payout", async () => {
        const gs = boardWithOneForest(8);
        gs.robberHexIndex = 0;
        gs.vertices[BOARD_TOPOLOGY.hexVertices[0][0]] = { building: "settlement", owner: "u1" };
        gs.playerStates.set("u1", player());
        const game = makeGame(gs);

        await rollOf(5, 3).Execute(game as unknown as IGameData);
        expect(gs.playerStates.get("u1")!.resources.lumber).toBe(0);
        expect(gs.lastRollChanges).toEqual([]);
    });

    it("counts the cards a 7 takes off each player, and never which ones", async () => {
        const gs = boardWithOneForest(8);
        gs.playerStates.set("u1", player({ resources: { lumber: 2 } }));
        gs.playerStates.set("u2", player({ resources: { lumber: 5, wool: 5 } }));
        const game = makeGame(gs);

        await rollOf(3, 4).Execute(game as unknown as IGameData);
        // Alice was under the limit; Bob's ten-card hand loses five. Which five is
        // the shuffle's business and stays off the record.
        expect(gs.lastRollChanges).toEqual([
            { userId: "u2", gained: { lumber: 0, wool: 0, grain: 0, brick: 0, ore: 0 }, discarded: 5 },
        ]);
        expect(game.gameState.history[0].text).toBe("{{u1}} rolled a 7 — {{u2}} −5 cards");
        expect(gs.pendingRobber).toBe(true);
    });

    it("clears the last roll and its payout when the turn passes", async () => {
        const gs = boardWithOneForest(8);
        gs.vertices[BOARD_TOPOLOGY.hexVertices[0][0]] = { building: "settlement", owner: "u1" };
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", player());
        const game = makeGame(gs);

        await rollOf(5, 3).Execute(game as unknown as IGameData);
        expect(gs.lastRollChanges).toHaveLength(1);

        // Passing the dice on is CheckEndTurn's job, not the command's.
        const endTurn = await cmd(new SACEndTurn()).Execute(game as unknown as IGameData);
        new SettlementsAndCitiesGameType().CheckEndTurn(game as unknown as IGameData, endTurn);
        expect(gs.lastRoll).toBeNull();
        expect(gs.lastRollChanges).toEqual([]);
    });
});

describe("Settlements & Cities — victory-point cards", () => {
    it("wins immediately on buying the final Victory Point card", () => {
        // 9 visible VP from the two bonuses (2+2) plus five settlements would be a
        // lot of board setup; instead lean on the bonuses and a stash of already-
        // held VP cards, then have a freshly-bought VP tip them over the target.
        const p = player({
            devCards: { victoryPoint: 5 } as ISACPlayerState["devCards"],
            newDevCards: { victoryPoint: 1 } as ISACPlayerState["devCards"],
        });
        const gs = makeState({ victoryTarget: 6 });
        gs.playerStates.set("u1", p);
        const game = makeGame(gs, "u1");

        const won = new SettlementsAndCitiesGameType().CheckGameOver(game as unknown as IGameData);
        expect(won).toBe(true);
        expect(game.complete).toBe(true);
        expect(game.winner).toBe("u1");
    });

    it("does not count a just-bought VP card for a player whose turn it isn't", () => {
        const bob = player({
            devCards: {} as ISACPlayerState["devCards"],
            newDevCards: { victoryPoint: 1 } as ISACPlayerState["devCards"],
        });
        const gs = makeState({ victoryTarget: 1 });
        gs.playerStates.set("u1", player());
        gs.playerStates.set("u2", bob);
        const game = makeGame(gs, "u1"); // Alice's turn, not Bob's

        const won = new SettlementsAndCitiesGameType().CheckGameOver(game as unknown as IGameData);
        expect(won).toBe(false);
        expect(game.complete).toBe(false);
    });
});

// ─── What the match review calls each action ──────────────────────────────────
// `myString()` is the line the review dock prints after the player's name
// ("Alice · built a road") — the same place the recap screen reads like prose —
// so it has to be written in the player's language. These used to be the debug
// strings the commands were first written with ("SAC BuildRoad edge=17"), which
// is exactly what a reviewing player saw.

describe("Settlements & Cities — action summaries", () => {
    // Swept off the module rather than listed, so a command added later can't
    // ship a debug summary just by not being added to this test.
    const commandClasses = (Object.values(SACLogic) as unknown[]).filter(
        (exported): exported is new () => IGameCommand =>
            typeof exported === "function" &&
            typeof (exported as { prototype?: { myString?: unknown } }).prototype?.myString === "function"
    );

    it("summarises every command in words, not as a debug string", () => {
        expect(commandClasses.length).toBeGreaterThan(10);
        for (const Command of commandClasses) {
            const summary = new Command().myString();
            expect(summary, `${new Command().className} reads as debug output`).not.toMatch(/SAC |=|vertexId|edgeId/);
            // It continues "<player> · …", so it starts mid-sentence.
            expect(summary[0]).toBe(summary[0].toLowerCase());
        }
    });

    it("names the roll it recorded, and why a 7 stirs the robber", () => {
        const roll = new SACRollDice();
        expect(roll.myString()).toBe("rolled the dice");
        roll.recordedRoll1 = 2;
        roll.recordedRoll2 = 3;
        expect(roll.myString()).toBe("rolled a 5");
        roll.recordedRoll1 = 3;
        roll.recordedRoll2 = 4;
        expect(roll.myString()).toBe("rolled a 7 — the robber stirs");
    });

    it("names who the robber stole from by token, so replay resolves the name", () => {
        const move = cmd(new SACMoveRobber());
        expect(move.myString()).toBe("moved the robber");
        move.stealFromUserId = "u2";
        expect(resolveTokens(move.myString(), { u2: "Bob" })).toBe("moved the robber and stole a card from Bob");
    });
});
