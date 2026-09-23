import { Types } from "mongoose";
import { describe, expect, it } from "vitest";

import type { IKingdomBuilderSettlement } from "./KingdomBuilderSettlementModel";
import { KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE } from "./buildings";
import { applyTick } from "./tick";

function settlement(overrides: Partial<IKingdomBuilderSettlement> = {}): IKingdomBuilderSettlement {
    return {
        worldId: new Types.ObjectId(), ownerId: "owner", nodeId: "site",
        tiles: [
            { position: 0, building: { type: "lumber-camp", level: 2 } },
            { position: 1, building: { type: "quarry", level: 1 } },
            { position: 2, building: { type: "mine", level: 3 } },
        ],
        resources: { wood: 4, stone: 5, iron: 6 },
        createdAt: new Date(0), updatedAt: new Date(0), ...overrides,
    };
}

describe("Kingdom Builder tick engine", () => {
    it("adds production and advances unfinished construction without mutating the input", () => {
        const input = { currentTick: 7, settlements: [settlement({
            construction: { tilePosition: 3, buildingType: "barracks", targetLevel: 1, ticksRemaining: 2 },
        })] };

        const result = applyTick(input);

        expect(result.currentTick).toBe(8);
        expect(result.settlements[0].resources).toEqual({ wood: 6, stone: 6, iron: 9 });
        expect(result.settlements[0].construction?.ticksRemaining).toBe(1);
        expect(input.settlements[0].resources).toEqual({ wood: 4, stone: 5, iron: 6 });
        expect(input.settlements[0].construction?.ticksRemaining).toBe(2);
    });

    it("completes construction but waits until the next tick to collect its production", () => {
        const input = { currentTick: 0, settlements: [settlement({
            tiles: [{ position: 3 }], resources: { wood: 0, stone: 0, iron: 0 },
            construction: { tilePosition: 3, buildingType: "lumber-camp", targetLevel: 2, ticksRemaining: 1 },
        })] };

        const completed = applyTick(input);
        expect(completed.settlements[0].tiles[0].building).toEqual({ type: "lumber-camp", level: 2 });
        expect(completed.settlements[0].construction).toBeUndefined();
        expect(completed.settlements[0].resources.wood).toBe(0);
        expect(applyTick(completed).settlements[0].resources.wood).toBe(2);
    });

    it("pays the town centre's trickle whatever else stands", () => {
        const input = { currentTick: 0, settlements: [settlement({
            tiles: [{ position: 4, building: { type: "town-centre", level: 1 } }], resources: { wood: 0, stone: 0, iron: 0 },
        })] };

        expect(applyTick(input).settlements[0].resources).toEqual(KINGDOM_BUILDER_TOWN_CENTRE_TRICKLE);
    });

    it("trains the barracks' queue into the garrison alongside construction", () => {
        const input = { currentTick: 0, settlements: [settlement({
            construction: { tilePosition: 3, buildingType: "barracks", targetLevel: 2, ticksRemaining: 2 },
            trainingQueue: [{ unitType: "militia", ticksRemaining: 1 }, { unitType: "militia", ticksRemaining: 2 }],
        })] };

        const once = applyTick(input);
        expect(once.settlements[0].garrison?.militia).toBe(1);
        expect(once.settlements[0].trainingQueue).toEqual([{ unitType: "militia", ticksRemaining: 2 }]);
        expect(once.settlements[0].construction?.ticksRemaining).toBe(1);
        expect(input.settlements[0].trainingQueue).toHaveLength(2);

        const thrice = applyTick(applyTick(once));
        expect(thrice.settlements[0].garrison?.militia).toBe(2);
        expect(thrice.settlements[0].trainingQueue).toEqual([]);
    });
});
