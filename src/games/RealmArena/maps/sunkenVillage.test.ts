import { describe, expect, it } from "vitest";
import { canSee } from "@/utils/games/battlefield/lineOfSight";
import { distance, HALF_HEIGHT, isNeighbour, TERRAIN, type Battlefield } from "@/utils/games/battlefield/terrain";
import { mapFor } from ".";
import { SACKED_FORT_THREE } from "./sackedFort";
import { SUNKEN_VILLAGE_THREE as VILLAGE } from "./sunkenVillage";
import { inMiddle, quarterTurn, sorted, standable } from "./testFixtures";

// The Sunken Village (§35): Hold Out's second battlefield, for a team of
// three, over ground an archer can't see far across. What it shares with the
// Sacked Fort is held in holdOut.test.ts; this is its own.
describe("the Sunken Village", () => {
    const size = VILLAGE.width;
    const team = 3;
    const warbandZones = VILLAGE.deployments.slice(team);
    const green = (square: number) => inMiddle(VILLAGE, square);

    it("sinks the green half a height below the village, with a ramp down on each side", () => {
        const sunk = VILLAGE.tiles.flatMap((tile, square) => green(square) ? [tile.elevation] : []);
        expect(new Set(sunk)).toEqual(new Set([0]));
        // Every square round the green stands half a height over it, but for a ramp a quarter down from the village in each side.
        const rim = standable(VILLAGE).filter(square => !green(square) && VILLAGE.tiles.some((_, inside) => green(inside) && isNeighbour(VILLAGE, square, inside)));
        const ramps = rim.filter(square => VILLAGE.tiles[square].elevation < HALF_HEIGHT);
        expect(rim.every(square => VILLAGE.tiles[square].elevation >= HALF_HEIGHT - 1)).toBe(true);
        expect(ramps.length).toBe(8);
        expect(sorted(ramps.map(square => quarterTurn(VILLAGE, square)))).toEqual(sorted(ramps));
    });

    it("hides the green from the fields: nobody in a warband's zone can see any of it", () => {
        const onGreen = VILLAGE.tiles.flatMap((_, square) => green(square) ? [square] : []);
        for (const zone of warbandZones) expect(zone.some(from => onGreen.some(to => canSee(VILLAGE, from, to)))).toBe(false);
    });

    it("lets an archer see under half as much of its bow's reach as on the Sacked Fort", () => {
        // A square in every five, from each to everything in bow range (§13.2's 20 squares).
        const seen = (field: Battlefield) => {
            const squares = standable(field);
            let share = 0, from = 0;
            for (let i = 0; i < squares.length; i += 5, from++) {
                const near = squares.filter(to => to !== squares[i] && distance(field, squares[i], to) <= 20);
                share += near.filter(to => canSee(field, squares[i], to)).length / near.length;
            }
            return share / from;
        };
        expect(seen(VILLAGE)).toBeLessThan(seen(SACKED_FORT_THREE) / 2);
    });

    it("can be got through: the hedge round the village has three gaps a side, and a hedge can be climbed through", () => {
        expect(TERRAIN.h.moveCost).toBeLessThan(Infinity);
        // Six squares in on the north side: the lane's gap and the two field gates.
        const line = Array.from({ length: size }, (_, col) => VILLAGE.tiles[6 * size + col].terrain).slice(6, size - 6);
        expect(line.map(terrain => terrain === TERRAIN.h ? "h" : "-").join("").split("h").filter(Boolean)).toHaveLength(3);
    });
});

describe("mapFor with the Sunken Village (§35)", () => {
    it("puts a co-op team of three on it when the host picked it, a team of two on the Sacked Fort, and anyone else on their usual map", () => {
        expect(mapFor(3, true, "sunkenVillage")).toBe("sunkenVillageThree");
        expect(mapFor(2, true, "sunkenVillage")).toBe("sackedFortTwo");
        expect(mapFor(1, true, "sunkenVillage")).toBe("ruinedFort");
        expect(mapFor(3, false, "sunkenVillage")).toBe("ringFort");
    });
});
