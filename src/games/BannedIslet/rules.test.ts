import { describe, expect, it } from "vitest";
import {
    PIER_TILE,
    TILE_IDS,
    WATER_LEVEL_TRACK,
    BannedIsletRoleId,
    BannedIsletTileId,
} from "./board";
import {
    IBannedIsletPosition,
    applyFloodCard,
    capturableTreasureAt,
    floodRateFor,
    isDrowningLoss,
    isPierLoss,
    isStandable,
    isTreasureLoss,
    isWaterLevelLoss,
    liftOrigin,
    lostTreasures,
    moveTargets,
    pierPosition,
    positionOfTile,
    resolveSwim,
    routeDistance,
    sandbagsTargets,
    shoreUpTargets,
    treasureAt,
} from "./rules";
import {
    EAST_OF_MIDDLE,
    FAR_EAST,
    MIDDLE,
    NORTH_EAST,
    NORTH_OF_MIDDLE,
    NORTH_WEST,
    NOTHING_CAPTURED,
    SOUTH_OF_MIDDLE,
    TOP_TIP,
    TOP_TIP_EAST,
    WEST_OF_MIDDLE,
    island,
    IIslandOptions,
} from "./testFixtures";

// The role to ask the base rules with: §12's Messenger is the only one of the
// six whose ability isn't spatial, so it reads every movement, shoring and
// swimming rule exactly as written. The five that don't have their own
// describe block below.
const BASE: BannedIsletRoleId = 'messenger';

describe("moveTargets (§8)", () => {
    it("offers the four orthogonal neighbours, and never a diagonal", () => {
        expect(moveTargets(island(), MIDDLE, BASE).sort((a, b) => a - b)).toEqual(
            [NORTH_OF_MIDDLE, WEST_OF_MIDDLE, EAST_OF_MIDDLE, SOUTH_OF_MIDDLE].sort((a, b) => a - b),
        );
        expect(moveTargets(island(), MIDDLE, BASE)).not.toContain(NORTH_WEST);
    });

    it("counts a flooded tile as standable and a hole as gone (§9.1, §16)", () => {
        const board = island({ flooded: [NORTH_OF_MIDDLE], sunk: [EAST_OF_MIDDLE] });
        expect(moveTargets(board, MIDDLE, BASE)).toContain(NORTH_OF_MIDDLE);
        expect(moveTargets(board, MIDDLE, BASE)).not.toContain(EAST_OF_MIDDLE);
        expect(isStandable(board, NORTH_OF_MIDDLE)).toBe(true);
        expect(isStandable(board, EAST_OF_MIDDLE)).toBe(false);
    });

    it("leaves a pawn ringed by holes with nowhere to step", () => {
        const severed = island({ sunk: [NORTH_OF_MIDDLE, WEST_OF_MIDDLE, EAST_OF_MIDDLE, SOUTH_OF_MIDDLE] });
        expect(moveTargets(severed, MIDDLE, BASE)).toEqual([]);
    });
});

describe("shoreUpTargets (§8)", () => {
    it("dries out this tile and its neighbours, and only the flooded ones (§16)", () => {
        const board = island({ flooded: [MIDDLE, EAST_OF_MIDDLE] });
        expect(shoreUpTargets(board, MIDDLE, BASE)).toEqual([MIDDLE, EAST_OF_MIDDLE].sort((a, b) => a - b));
    });

    it("never un-sinks a tile, and never reaches past a neighbour (§9.1)", () => {
        expect(shoreUpTargets(island({ sunk: [EAST_OF_MIDDLE] }), MIDDLE, BASE)).toEqual([]);
        expect(shoreUpTargets(island({ flooded: [FAR_EAST] }), MIDDLE, BASE)).toEqual([]);
    });
});

describe("capturing (§8)", () => {
    it("captures with four matching cards on either of that treasure's tiles", () => {
        const board = island({ tiles: { [MIDDLE]: 'cinderTemple', [FAR_EAST]: 'ashfallHollow' } });
        expect(treasureAt(board, MIDDLE)).toBe('emberCrown');
        const hand = ['emberCrown', 'emberCrown', 'emberCrown', 'emberCrown', 'sandbags'] as const;
        expect(capturableTreasureAt(board, MIDDLE, hand, NOTHING_CAPTURED)).toBe('emberCrown');
        expect(capturableTreasureAt(board, FAR_EAST, hand, NOTHING_CAPTURED)).toBe('emberCrown');
    });

    it("refuses three cards, the wrong tile, and a treasure already lifted", () => {
        const board = island({ tiles: { [MIDDLE]: 'cinderTemple' } });
        const four = ['emberCrown', 'emberCrown', 'emberCrown', 'emberCrown'] as const;
        expect(capturableTreasureAt(board, MIDDLE, four.slice(1), NOTHING_CAPTURED)).toBeNull();
        expect(capturableTreasureAt(board, TOP_TIP, four, NOTHING_CAPTURED)).toBeNull();
        expect(capturableTreasureAt(board, MIDDLE, four, { ...NOTHING_CAPTURED, emberCrown: true })).toBeNull();
    });
});

describe("applyFloodCard (§9.1)", () => {
    it("takes a dry tile to flooded and sends its card to the discard", () => {
        const result = applyFloodCard(island(), PIER_TILE);
        expect(result.position).toBe(positionOfTile(island(), PIER_TILE));
        expect(result.to).toBe('flooded');
        expect(result.sank).toBe(false);
        expect(result.cardLeavesGame).toBe(false);
        expect(result.island[result.position].state).toBe('flooded');
    });

    it("sinks a flooded tile and removes its flood card from the game", () => {
        const flooded = applyFloodCard(island(), 'kelpStair');
        const sunk = applyFloodCard(flooded.island, 'kelpStair');
        expect(sunk.from).toBe('flooded');
        expect(sunk.to).toBe('sunk');
        expect(sunk.sank).toBe(true);
        expect(sunk.cardLeavesGame).toBe(true);
    });

    it("leaves the island it was given alone", () => {
        const before = island();
        applyFloodCard(before, 'kelpStair');
        expect(before.every(p => p.state === 'dry')).toBe(true);
    });

    it("stays total on a tile that has already gone, and keeps the card out of the game", () => {
        const gone = island({ sunk: [positionOfTile(island(), 'kelpStair')] });
        const result = applyFloodCard(gone, 'kelpStair');
        expect(result.to).toBe('sunk');
        expect(result.sank).toBe(false);
        expect(result.cardLeavesGame).toBe(true);
    });
});

describe("routeDistance (§5.1)", () => {
    it("walks the island in steps, and counts standing still as none", () => {
        expect(routeDistance(island(), MIDDLE, MIDDLE)).toBe(0);
        expect(routeDistance(island(), TOP_TIP, MIDDLE)).toBe(2);
    });

    it("is severed by a sunk tile — the hole doesn't close (§5.1)", () => {
        const severed = island({ sunk: [NORTH_OF_MIDDLE, NORTH_EAST] });
        expect(routeDistance(island(), TOP_TIP, MIDDLE)).toBe(2);
        expect(routeDistance(severed, TOP_TIP, MIDDLE)).toBeNull();
        expect(routeDistance(severed, TOP_TIP, TOP_TIP_EAST)).toBe(1); // the tip is cut off, not gone
    });

    it("routes through a flooded tile, which is only a tile with one life left (§9.1)", () => {
        expect(routeDistance(island({ flooded: [NORTH_OF_MIDDLE] }), TOP_TIP, MIDDLE)).toBe(2);
    });
});

describe("resolveSwim (§9.2, §21.3)", () => {
    it("prefers a dry tile to a flooded one", () => {
        const sinking = island({
            flooded: [NORTH_OF_MIDDLE, EAST_OF_MIDDLE, SOUTH_OF_MIDDLE],
            sunk: [MIDDLE],
        });
        expect(resolveSwim(sinking, MIDDLE, BASE)).toBe(WEST_OF_MIDDLE);
    });

    it("stands a pawn on a flooded tile rather than drowning it (§16)", () => {
        const sinking = island({
            flooded: [NORTH_OF_MIDDLE, WEST_OF_MIDDLE, EAST_OF_MIDDLE, SOUTH_OF_MIDDLE],
            sunk: [MIDDLE],
        });
        expect(resolveSwim(sinking, MIDDLE, BASE)).not.toBeNull();
    });

    it("breaks a tie between two dry tiles by the route home to Beacon Pier", () => {
        const sinking = island({
            tiles: { [EAST_OF_MIDDLE]: PIER_TILE },
            sunk: [MIDDLE, WEST_OF_MIDDLE, SOUTH_OF_MIDDLE],
        });
        expect(pierPosition(sinking)).toBe(EAST_OF_MIDDLE);
        expect(resolveSwim(sinking, MIDDLE, BASE)).toBe(EAST_OF_MIDDLE);
    });

    it("breaks a remaining tie by the lowest tile id, so a replay swims the same way", () => {
        // The pier sits on the tip, cut off from both candidates, so neither has
        // a route home and only §5.2's printed order can separate them.
        const cutOff: IIslandOptions = {
            tiles: { [TOP_TIP]: PIER_TILE },
            sunk: [MIDDLE, NORTH_OF_MIDDLE, NORTH_EAST, SOUTH_OF_MIDDLE],
        };
        const westIsLower = island({ ...cutOff, tiles: { ...cutOff.tiles, [WEST_OF_MIDDLE]: 'cinderTemple', [EAST_OF_MIDDLE]: 'shellRoad' } });
        expect(resolveSwim(westIsLower, MIDDLE, BASE)).toBe(WEST_OF_MIDDLE);

        const eastIsLower = island({ ...cutOff, tiles: { ...cutOff.tiles, [EAST_OF_MIDDLE]: 'cinderTemple', [WEST_OF_MIDDLE]: 'shellRoad' } });
        expect(resolveSwim(eastIsLower, MIDDLE, BASE)).toBe(EAST_OF_MIDDLE);
    });

    it("drowns a pawn with nowhere to go — and that is the loss (§4.2)", () => {
        const stranded = island({ sunk: [TOP_TIP, TOP_TIP_EAST, NORTH_OF_MIDDLE] });
        expect(resolveSwim(stranded, TOP_TIP, BASE)).toBeNull();
        expect(isDrowningLoss(stranded, TOP_TIP, BASE)).toBe(true);
        expect(isDrowningLoss(island({ sunk: [TOP_TIP] }), TOP_TIP, BASE)).toBe(false);
    });
});

describe("floodRateFor (§11)", () => {
    it("reads §11's table, one entry per water level", () => {
        expect(WATER_LEVEL_TRACK.map((_, index) => floodRateFor(index + 1))).toEqual([...WATER_LEVEL_TRACK]);
    });

    it("clamps rather than returning undefined for a level off either end of the meter", () => {
        expect(floodRateFor(0)).toBe(WATER_LEVEL_TRACK[0]);
        expect(floodRateFor(10)).toBe(WATER_LEVEL_TRACK[WATER_LEVEL_TRACK.length - 1]);
        expect(floodRateFor(99)).toBe(WATER_LEVEL_TRACK[WATER_LEVEL_TRACK.length - 1]);
    });
});

describe("the four losses (§4.2)", () => {
    it("loses the moment Beacon Pier sinks", () => {
        expect(isPierLoss(island())).toBe(false);
        expect(isPierLoss(island({ flooded: [positionOfTile(island(), PIER_TILE)] }))).toBe(false);
        expect(isPierLoss(island({ sunk: [positionOfTile(island(), PIER_TILE)] }))).toBe(true);
    });

    it("loses a treasure when both its tiles go under uncaptured, and not when it was lifted first", () => {
        const tiles = { [MIDDLE]: 'cinderTemple' as BannedIsletTileId, [FAR_EAST]: 'ashfallHollow' as BannedIsletTileId };
        const halfGone = island({ tiles, sunk: [MIDDLE] });
        const bothGone = island({ tiles, sunk: [MIDDLE, FAR_EAST] });

        expect(lostTreasures(island({ tiles }), NOTHING_CAPTURED)).toEqual([]);
        expect(lostTreasures(halfGone, NOTHING_CAPTURED)).toEqual([]);
        expect(lostTreasures(bothGone, NOTHING_CAPTURED)).toEqual(['emberCrown']);
        expect(isTreasureLoss(bothGone, NOTHING_CAPTURED)).toBe(true);
        expect(isTreasureLoss(bothGone, { ...NOTHING_CAPTURED, emberCrown: true })).toBe(false);
    });

    it("loses when the meter reaches the skull, and not a level before it", () => {
        expect(isWaterLevelLoss(9)).toBe(false);
        expect(isWaterLevelLoss(10)).toBe(true);
    });
});

describe("the special cards (§10)", () => {
    it("sandbags reach every flooded tile on the island, and only those", () => {
        const board = island({ flooded: [TOP_TIP, FAR_EAST], sunk: [MIDDLE] });

        // The whole board, not just a neighbourhood: that reach is the one
        // thing §21.3 left the card when async play took its timing away.
        expect(sandbagsTargets(board)).toEqual([TOP_TIP, FAR_EAST].sort((a, b) => a - b));
        // Never a dry tile (§16) and never a hole (§9.1).
        expect(sandbagsTargets(island())).toEqual([]);
        expect(sandbagsTargets(board)).not.toContain(MIDDLE);
    });

    it("a lift takes passengers off one tile, and refuses a list that spans two", () => {
        const pawns = [
            { userId: "u1", position: MIDDLE },
            { userId: "u2", position: MIDDLE },
            { userId: "u3", position: TOP_TIP },
        ];

        expect(liftOrigin(pawns, ["u1"])).toBe(MIDDLE);
        expect(liftOrigin(pawns, ["u1", "u2"])).toBe(MIDDLE);
        expect(liftOrigin(pawns, ["u3"])).toBe(TOP_TIP);
        expect(liftOrigin(pawns, ["u1", "u3"])).toBeNull();
    });

    it("has no origin for nobody, a repeated passenger or a pawn that isn't there", () => {
        const pawns = [{ userId: "u1", position: MIDDLE }];

        // An empty list is §4.1's escape call rather than an error — it moves
        // nobody, so it has no tile to move them off.
        expect(liftOrigin(pawns, [])).toBeNull();
        expect(liftOrigin(pawns, ["u1", "u1"])).toBeNull();
        expect(liftOrigin(pawns, ["u9"])).toBeNull();
    });
});
