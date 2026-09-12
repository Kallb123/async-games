import { describe, expect, it } from "vitest";
import {
    ACTIONS_PER_TURN,
    CARDS_TO_CAPTURE,
    DIAMOND_ROW_WIDTHS,
    DIFFICULTIES,
    GRID_SIZE,
    HAND_LIMIT,
    LOSING_WATER_LEVEL,
    MAX_PLAYERS,
    MIN_PLAYERS,
    PIER_TILE,
    PLAYABLE_CARD_IDS,
    POSITION_COUNT,
    ROLES,
    TILES,
    TILE_COUNT,
    TILE_IDS,
    TREASURE_IDS,
    TREASURES,
    WATER_LEVEL_TRACK,
    colOf,
    difficultyDef,
    isIslandCell,
    orthogonalNeighbours,
    positionAt,
    rowOf,
    sortHand,
    startWaterLevelFor,
    tileOrder,
    BannedIsletCardId,
    BannedIsletDifficulty,
} from "./board";

describe("the diamond (§5.1)", () => {
    it("cuts 24 positions out of the 6 × 6 grid, in rows of 2/4/6/6/4/2", () => {
        expect(GRID_SIZE).toBe(6);
        expect(POSITION_COUNT).toBe(24);
        expect([...DIAMOND_ROW_WIDTHS]).toEqual([2, 4, 6, 6, 4, 2]);

        const widthByRow = new Array(GRID_SIZE).fill(0);
        for (let position = 0; position < POSITION_COUNT; position++) widthByRow[rowOf(position)]++;
        expect(widthByRow).toEqual([...DIAMOND_ROW_WIDTHS]);
    });

    it("centres every row, so the mask really is a diamond and not a staircase", () => {
        for (let row = 0; row < GRID_SIZE; row++) {
            const cols: number[] = [];
            for (let col = 0; col < GRID_SIZE; col++) if (isIslandCell(row, col)) cols.push(col);
            expect(cols).toHaveLength(DIAMOND_ROW_WIDTHS[row]);
            expect(cols[0]).toBe(GRID_SIZE - 1 - cols[cols.length - 1]);
        }
    });

    it("round-trips every position through its grid cell, and only island cells have one", () => {
        for (let position = 0; position < POSITION_COUNT; position++) {
            expect(positionAt(rowOf(position), colOf(position))).toBe(position);
        }
        let islandCells = 0;
        for (let row = 0; row < GRID_SIZE; row++) {
            for (let col = 0; col < GRID_SIZE; col++) {
                if (isIslandCell(row, col)) islandCells++;
                else expect(positionAt(row, col)).toBeNull();
            }
        }
        expect(islandCells).toBe(POSITION_COUNT);
    });

    it("has no position off the edge of the grid", () => {
        expect(positionAt(-1, 2)).toBeNull();
        expect(positionAt(2, GRID_SIZE)).toBeNull();
        expect(isIslandCell(0, 0)).toBe(false); // the corner the diamond cuts off
        expect(isIslandCell(0, 2)).toBe(true);
    });
});

describe("adjacency (§5.1, §19)", () => {
    it("is symmetric — every neighbour names you back", () => {
        for (let position = 0; position < POSITION_COUNT; position++) {
            for (const neighbour of orthogonalNeighbours(position)) {
                expect(orthogonalNeighbours(neighbour)).toContain(position);
            }
        }
    });

    it("is orthogonal only: every neighbour is one step in exactly one of row or column", () => {
        for (let position = 0; position < POSITION_COUNT; position++) {
            for (const neighbour of orthogonalNeighbours(position)) {
                const rowStep = Math.abs(rowOf(position) - rowOf(neighbour));
                const colStep = Math.abs(colOf(position) - colOf(neighbour));
                expect(rowStep + colStep).toBe(1);
            }
        }
    });

    it("gives nobody a self-loop, a duplicate or a fifth neighbour", () => {
        for (let position = 0; position < POSITION_COUNT; position++) {
            const neighbours = orthogonalNeighbours(position);
            expect(neighbours).not.toContain(position);
            expect(new Set(neighbours).size).toBe(neighbours.length);
            expect(neighbours.length).toBeLessThanOrEqual(4);
            expect(neighbours.length).toBeGreaterThan(0);
        }
    });

    it("names the neighbours of the top tip, a west edge and the middle", () => {
        expect(orthogonalNeighbours(positionAt(0, 2)!).sort()).toEqual([positionAt(0, 3)!, positionAt(1, 2)!].sort());
        expect(orthogonalNeighbours(positionAt(2, 0)!).sort()).toEqual([positionAt(2, 1)!, positionAt(3, 0)!].sort());
        expect(orthogonalNeighbours(positionAt(2, 2)!).sort()).toEqual(
            [positionAt(1, 2)!, positionAt(2, 1)!, positionAt(2, 3)!, positionAt(3, 2)!].sort(),
        );
    });

    it("connects the whole island — no position starts the game cut off", () => {
        const seen = new Set<number>([0]);
        const queue = [0];
        while (queue.length > 0) {
            for (const neighbour of orthogonalNeighbours(queue.shift()!)) {
                if (!seen.has(neighbour)) { seen.add(neighbour); queue.push(neighbour); }
            }
        }
        expect(seen.size).toBe(POSITION_COUNT);
    });

    it("leaves a corner-touching position out of adjacency entirely (§19)", () => {
        expect(orthogonalNeighbours(positionAt(2, 2)!)).not.toContain(positionAt(1, 1)!);
        expect(orthogonalNeighbours(positionAt(2, 2)!)).not.toContain(positionAt(3, 3)!);
    });
});

describe("the tiles (§5.2)", () => {
    it("names 24 of them, one per position, with unique ids and names", () => {
        expect(TILE_COUNT).toBe(24);
        expect(TILE_COUNT).toBe(POSITION_COUNT);
        expect(new Set(TILE_IDS).size).toBe(24);
        expect(new Set(TILES.map(t => t.name)).size).toBe(24);
    });

    it("orders them by §5.2's printed order, which is what the swim tie-break reads", () => {
        TILE_IDS.forEach((tile, index) => expect(tileOrder(tile)).toBe(index));
        expect(TILES.find(t => t.id === PIER_TILE)!.name).toBe('Beacon Pier');
    });

    it("gives each treasure two tiles of its own, eight in all", () => {
        expect(TREASURES).toHaveLength(4);
        const treasureTiles = TREASURES.flatMap(t => t.tiles);
        expect(treasureTiles).toHaveLength(8);
        expect(new Set(treasureTiles).size).toBe(8);
        for (const tile of treasureTiles) expect(TILE_IDS).toContain(tile);
    });

    it("starts each of the six roles on a tile of its own, the Pilot on the pier", () => {
        expect(ROLES).toHaveLength(6);
        expect(new Set(ROLES.map(r => r.startTile)).size).toBe(6);
        for (const role of ROLES) expect(TILE_IDS).toContain(role.startTile);
        expect(ROLES.find(r => r.id === 'pilot')!.startTile).toBe(PIER_TILE);
    });

    it("leaves exactly ten plain tiles — §5.2's tuning knob for how forgiving the island is", () => {
        const spokenFor = new Set([PIER_TILE, ...TREASURES.flatMap(t => t.tiles), ...ROLES.map(r => r.startTile)]);
        expect(TILE_IDS.filter(tile => !spokenFor.has(tile))).toHaveLength(10);
    });
});

describe("the numbers (§7, §8, §10, §11, §13)", () => {
    it("holds the counts §20 prints", () => {
        expect(MIN_PLAYERS).toBe(2);
        expect(MAX_PLAYERS).toBe(4);
        expect(ACTIONS_PER_TURN).toBe(3);
        expect(HAND_LIMIT).toBe(5);
        expect(CARDS_TO_CAPTURE).toBe(4);
    });

    it("tracks §11's flood rate for levels 1-9, with the skull at 10", () => {
        expect([...WATER_LEVEL_TRACK]).toEqual([2, 2, 3, 4, 4, 5, 5, 6, 6]);
        expect(WATER_LEVEL_TRACK).toHaveLength(LOSING_WATER_LEVEL - 1);
    });

    it("starts §13's four difficulties one level apart", () => {
        expect(DIFFICULTIES.map(d => d.id)).toEqual(['novice', 'normal', 'elite', 'legendary']);
        expect(DIFFICULTIES.map(d => d.startWaterLevel)).toEqual([1, 2, 3, 4]);
        expect(startWaterLevelFor('legendary')).toBe(4);
    });

    it("falls back to Novice rather than trusting a difficulty that was never validated", () => {
        expect(difficultyDef('nonsense' as BannedIsletDifficulty)).toBe(DIFFICULTIES[0]);
    });
});

describe("sortHand", () => {
    it("groups a hand by card type — every treasure before either special", () => {
        const hand: BannedIsletCardId[] = ['sandbags', 'stormIdol', 'emberCrown', 'helicopterLift', 'stormIdol'];
        expect(sortHand(hand)).toEqual(['emberCrown', 'stormIdol', 'stormIdol', 'helicopterLift', 'sandbags']);
    });

    it("orders treasures before specials, matching TREASURE_IDS then PLAYABLE_CARD_IDS", () => {
        const hand: BannedIsletCardId[] = [...PLAYABLE_CARD_IDS, ...TREASURE_IDS].reverse();
        expect(sortHand(hand)).toEqual([...TREASURE_IDS, ...PLAYABLE_CARD_IDS]);
    });

    it("never has to place Waters Rise! — §10 never lets it sit in a hand", () => {
        expect(TREASURE_IDS as readonly BannedIsletCardId[]).not.toContain('watersRise');
        expect(PLAYABLE_CARD_IDS as readonly BannedIsletCardId[]).not.toContain('watersRise');
    });
});
