import { describe, expect, it } from "vitest";
import type { ICommandOutcome, IGameCommand } from "@/utils/apiModels/GameLogic";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { IWorldDominationSpecificGameStateResponse } from "./apiModels";
import { worldDominationRecapAdapter } from "./recap";

function state(cardCount: number): IWorldDominationSpecificGameStateResponse {
    return {
        territories: [],
        playerStates: {
            u1: {
                userId: "u1", username: "Alice", territoryCount: 1, armies: 1,
                totalArmiesDeployed: 1, cardCount, eliminated: false,
            },
        },
        phase: "reinforce",
        reinforcementsRemaining: 0,
        pendingOccupation: null,
        fortifyUsed: false,
        cardSetsCashedIn: 0,
        cardDeckSize: 0,
        lastBattle: null,
        canUndo: false,
        autoEndTurnAt: null,
    };
}

function snapshot(cardCount: number): ITurnSnapshot {
    return { specificGameState: state(cardCount) } as ITurnSnapshot;
}

function command(className = "WorldDominationEndTurn"): IGameCommand {
    return {
        id: "command" as uuidString,
        timestamp: "2026-09-25T12:00:00.000Z",
        gameId: "game" as uuidString,
        senderId: "u1",
        senderUsername: "Alice",
        className,
        myString: () => className,
        Execute: async () => ({ validMove: true, turnOver: true }),
    };
}

const outcome: ICommandOutcome = { validMove: true, turnOver: true };

describe("World Domination recap — ending a turn", () => {
    it("keeps a plain end turn out of the recap", () => {
        expect(worldDominationRecapAdapter.toEvents(snapshot(0), snapshot(0), command(), outcome)).toEqual([]);
    });

    it("shows the card produced by an end turn", () => {
        const events = worldDominationRecapAdapter.toEvents(snapshot(0), snapshot(1), command(), outcome);

        expect(events).toMatchObject([{
            type: "wd_draw",
            title: "Alice drew a World Domination card",
            detail: "1 card in hand",
        }]);
    });

    it("still shows the card a fortify or a skip drew in a game recorded before the hold", () => {
        for (const className of ["WorldDominationFortify", "WorldDominationSkipFortify"]) {
            expect(worldDominationRecapAdapter.toEvents(snapshot(0), snapshot(1), command(className), outcome)
                .filter(event => event.type === "wd_draw")).toHaveLength(1);
        }
    });

    it("draws nothing in the recap for a held fortify, whose card is only drawn once the hold closes", () => {
        const held = worldDominationRecapAdapter.toEvents(snapshot(0), snapshot(0), command("WorldDominationFortify"), { validMove: true, turnOver: false });
        expect(held.some(event => event.type === "wd_draw")).toBe(false);
    });

    it("does not mistake cards captured in battle for an end-turn draw", () => {
        const events = worldDominationRecapAdapter.toEvents(
            snapshot(0),
            snapshot(2),
            command("WorldDominationAttack"),
            outcome,
        );

        expect(events.some(event => event.type === "wd_draw")).toBe(false);
    });
});
