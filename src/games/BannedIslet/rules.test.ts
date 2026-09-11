import { describe, expect, it } from "vitest";
import {
    PIER_TILE,
    TILE_IDS,
    WATER_LEVEL_TRACK,
    positionAt,
    BannedIsletTileId,
    BannedIsletTileState,
    BannedIsletTreasureId,
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
    legalMoves,
    legalShoreUps,
    lostTreasures,
    pierPosition,
    positionOfTile,
    resolveSwim,
    routeDistance,
    treasureAt,
} from "./rules";

// The diamond, by (row, col), so a test can say where it means rather than
// counting positions: the top tip is (0,2)/(0,3) and the widest rows are 2
// and 3. `MIDDLE` is the one position with four dry neighbours to lose.
const TOP_TIP = positionAt(0, 2)!;          // 0
const TOP_TIP_EAST = positionAt(0, 3)!;     // 1
const NORTH_WEST = positionAt(1, 1)!;       // 2
const NORTH_OF_MIDDLE = positionAt(1, 2)!;  // 3
const NORTH_EAST = positionAt(1, 3)!;       // 4
const WEST_OF_MIDDLE = positionAt(2, 1)!;   // 7
const MIDDLE = positionAt(2, 2)!;           // 8
const EAST_OF_MIDDLE = positionAt(2, 3)!;   // 9
const FAR_EAST = positionAt(2, 4)!;         // 10
const SOUTH_OF_MIDDLE = positionAt(3, 2)!;  // 14

const NOTHING_CAPTURED: Record<BannedIsletTreasureId, boolean> = {
    emberCrown: false, stormIdol: false, tideChalice: false, rootStone: false,
};

interface IIslandOptions {
    /** Swap named tiles into the positions that matter to the test; the other 24 fall where they fall. */
    tiles?: Record<number, BannedIsletTileId>;
    flooded?: number[];
    sunk?: number[];
}

/** A whole dry island, with the listed tiles shuffled into the listed positions and the listed positions in the listed states. */
function island(options: IIslandOptions = {}): IBannedIsletPosition[] {
    const positions: IBannedIsletPosition[] = TILE_IDS.map(tile => ({ tile, state: 'dry' as BannedIsletTileState }));
    for (const [position, tile] of Object.entries(options.tiles ?? {})) {
        const to = Number(position);
        const from = positions.findIndex(p => p.tile === tile);
        [positions[from].tile, positions[to].tile] = [positions[to].tile, positions[from].tile];
    }
    options.flooded?.forEach(p => { positions[p].state = 'flooded'; });
    options.sunk?.forEach(p => { positions[p].state = 'sunk'; });
    return positions;
}

describe("legalMoves (§8)", () => {
    it("offers the four orthogonal neighbours, and never a diagonal", () => {
        expect(legalMoves(island(), MIDDLE).sort((a, b) => a - b)).toEqual(
            [NORTH_OF_MIDDLE, WEST_OF_MIDDLE, EAST_OF_MIDDLE, SOUTH_OF_MIDDLE].sort((a, b) => a - b),
        );
        expect(legalMoves(island(), MIDDLE)).not.toContain(NORTH_WEST);
    });

    it("counts a flooded tile as standable and a hole as gone (§9.1, §16)", () => {
        const board = island({ flooded: [NORTH_OF_MIDDLE], sunk: [EAST_OF_MIDDLE] });
        expect(legalMoves(board, MIDDLE)).toContain(NORTH_OF_MIDDLE);
        expect(legalMoves(board, MIDDLE)).not.toContain(EAST_OF_MIDDLE);
        expect(isStandable(board, NORTH_OF_MIDDLE)).toBe(true);
        expect(isStandable(board, EAST_OF_MIDDLE)).toBe(false);
    });

    it("leaves a pawn ringed by holes with nowhere to step", () => {
        const severed = island({ sunk: [NORTH_OF_MIDDLE, WEST_OF_MIDDLE, EAST_OF_MIDDLE, SOUTH_OF_MIDDLE] });
        expect(legalMoves(severed, MIDDLE)).toEqual([]);
    });
});

describe("legalShoreUps (§8)", () => {
    it("dries out this tile and its neighbours, and only the flooded ones (§16)", () => {
        const board = island({ flooded: [MIDDLE, EAST_OF_MIDDLE] });
        expect(legalShoreUps(board, MIDDLE)).toEqual([MIDDLE, EAST_OF_MIDDLE].sort((a, b) => a - b));
    });

    it("never un-sinks a tile, and never reaches past a neighbour (§9.1)", () => {
        expect(legalShoreUps(island({ sunk: [EAST_OF_MIDDLE] }), MIDDLE)).toEqual([]);
        expect(legalShoreUps(island({ flooded: [FAR_EAST] }), MIDDLE)).toEqual([]);
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
        expect(resolveSwim(sinking, MIDDLE)).toBe(WEST_OF_MIDDLE);
    });

    it("stands a pawn on a flooded tile rather than drowning it (§16)", () => {
        const sinking = island({
            flooded: [NORTH_OF_MIDDLE, WEST_OF_MIDDLE, EAST_OF_MIDDLE, SOUTH_OF_MIDDLE],
            sunk: [MIDDLE],
        });
        expect(resolveSwim(sinking, MIDDLE)).not.toBeNull();
    });

    it("breaks a tie between two dry tiles by the route home to Beacon Pier", () => {
        const sinking = island({
            tiles: { [EAST_OF_MIDDLE]: PIER_TILE },
            sunk: [MIDDLE, WEST_OF_MIDDLE, SOUTH_OF_MIDDLE],
        });
        expect(pierPosition(sinking)).toBe(EAST_OF_MIDDLE);
        expect(resolveSwim(sinking, MIDDLE)).toBe(EAST_OF_MIDDLE);
    });

    it("breaks a remaining tie by the lowest tile id, so a replay swims the same way", () => {
        // The pier sits on the tip, cut off from both candidates, so neither has
        // a route home and only §5.2's printed order can separate them.
        const cutOff: IIslandOptions = {
            tiles: { [TOP_TIP]: PIER_TILE },
            sunk: [MIDDLE, NORTH_OF_MIDDLE, NORTH_EAST, SOUTH_OF_MIDDLE],
        };
        const westIsLower = island({ ...cutOff, tiles: { ...cutOff.tiles, [WEST_OF_MIDDLE]: 'cinderTemple', [EAST_OF_MIDDLE]: 'shellRoad' } });
        expect(resolveSwim(westIsLower, MIDDLE)).toBe(WEST_OF_MIDDLE);

        const eastIsLower = island({ ...cutOff, tiles: { ...cutOff.tiles, [EAST_OF_MIDDLE]: 'cinderTemple', [WEST_OF_MIDDLE]: 'shellRoad' } });
        expect(resolveSwim(eastIsLower, MIDDLE)).toBe(EAST_OF_MIDDLE);
    });

    it("drowns a pawn with nowhere to go — and that is the loss (§4.2)", () => {
        const stranded = island({ sunk: [TOP_TIP, TOP_TIP_EAST, NORTH_OF_MIDDLE] });
        expect(resolveSwim(stranded, TOP_TIP)).toBeNull();
        expect(isDrowningLoss(stranded, TOP_TIP)).toBe(true);
        expect(isDrowningLoss(island({ sunk: [TOP_TIP] }), TOP_TIP)).toBe(false);
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
