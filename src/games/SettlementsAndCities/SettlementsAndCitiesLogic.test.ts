import { describe, expect, it } from "vitest";
import {
    SettlementsAndCitiesGameType,
    SACBuyDevCard,
    SACPlayKnight,
    SACPlayRoadBuilding,
    SACPlayYearOfPlenty,
    SACPlayMonopoly,
} from "./SettlementsAndCitiesLogic";
import { makeState, player } from "./testFixtures";
import type { ISACSpecificGameState, ISACPlayerState, SAC_DevCard } from "./board";
import type { ISettlementsAndCitiesGameData } from "./SettlementsAndCitiesModels";
import type { IGameData } from "@/utils/mongodb/GameData";

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
