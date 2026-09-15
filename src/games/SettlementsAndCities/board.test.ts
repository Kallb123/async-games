import { describe, expect, it } from "vitest";
import {
    BOARD_TOPOLOGY,
    HEX_POSITIONS,
    generateBoard,
    hasAdjacentRedNumbers,
} from "./board";

// Enough boards that a generator which only *usually* obeyed the rule would
// fail here: a random deal breaks it about three times in four.
const SAMPLE_BOARDS = 60;

function boardsWith(balancedSetup: boolean) {
    return Array.from({ length: SAMPLE_BOARDS }, () => generateBoard(balancedSetup));
}

describe("hex adjacency", () => {
    it("pairs every neighbour both ways and nobody with themselves", () => {
        BOARD_TOPOLOGY.hexAdjacent.forEach((neighbours, hexId) => {
            expect(neighbours).not.toContain(hexId);
            for (const other of neighbours) {
                expect(BOARD_TOPOLOGY.hexAdjacent[other]).toContain(hexId);
            }
        });
    });

    it("surrounds the inland hexes and leaves the coast short", () => {
        const centre = HEX_POSITIONS.findIndex(({ q, r }) => q === 0 && r === 0);
        expect(BOARD_TOPOLOGY.hexAdjacent[centre]).toHaveLength(6);
        // The 19-hex island is one centre plus a ring of six, all fully
        // surrounded, inside a coastal ring of twelve that isn't.
        const surrounded = BOARD_TOPOLOGY.hexAdjacent.filter(n => n.length === 6);
        expect(surrounded).toHaveLength(7);
        // A coastal corner touches three; the rest of the coast touches four.
        for (const neighbours of BOARD_TOPOLOGY.hexAdjacent) {
            expect(neighbours.length).toBeGreaterThanOrEqual(3);
        }
    });
});

describe("generateBoard", () => {
    it("deals a balanced board with no two red numbers touching", () => {
        for (const board of boardsWith(true)) {
            expect(hasAdjacentRedNumbers(board.hexes)).toBe(false);
        }
    });

    it("still deals the same pool of terrain and numbers when balanced", () => {
        for (const board of boardsWith(true)) {
            const numbers = board.hexes.map(h => h.numberToken).filter((n): n is number => n !== null);
            expect([...numbers].sort((a, b) => a - b)).toEqual(
                [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12],
            );
            expect(board.hexes).toHaveLength(HEX_POSITIONS.length);
            expect(board.hexes.filter(h => h.terrain === 'desert')).toHaveLength(1);
            expect(board.hexes[board.desertHexIndex].terrain).toBe('desert');
            expect(board.hexes[board.desertHexIndex].numberToken).toBeNull();
        }
    });

    it("shuffles the terrain on a balanced board rather than fixing it", () => {
        const layouts = new Set(boardsWith(true).map(b => b.hexes.map(h => h.terrain).join(',')));
        expect(layouts.size).toBeGreaterThan(1);
    });

    it("leaves the random board random — red numbers may touch", () => {
        const boards = boardsWith(false);
        expect(boards.some(b => hasAdjacentRedNumbers(b.hexes))).toBe(true);
    });
});
