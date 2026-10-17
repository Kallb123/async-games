import { describe, expect, it } from "vitest";
import { buildBattlefield } from "@/utils/games/battlefield/terrain";
import { pieceCorner, piecesOf } from "./blockPieces";
import { QUARTER } from "./iso3d";

const field = (rows: string[]) => buildBattlefield({ name: "test", rows, deployments: [], objectives: {} });

describe("a raised square's pieces", () => {
    it("are the same every time, and a heap is chunks of different heights, the tallest the full height", () => {
        const map = field(["...", ".o.", "..."]);
        const pieces = piecesOf(map, 4, 2);
        expect(piecesOf(map, 4, 2)).toEqual(pieces);
        expect(pieces).toHaveLength(4);
        const height = map.tiles[4].elevation * QUARTER;
        expect(Math.max(...pieces.map(p => p.sy))).toBeCloseTo(height);
        expect(Math.min(...pieces.map(p => p.sy))).toBeLessThan(height);
        for (const p of pieces) {
            expect(p.drop).toBeGreaterThanOrEqual(0);
            expect(p.drop + p.sy).toBeLessThanOrEqual(2 + 1e-9);
        }
    });

    it("give a wall a merlon pair along each open edge, and none where it meets a wall", () => {
        const lone = piecesOf(field(["...", ".#.", "..."]), 4, 2.4);
        expect(lone).toHaveLength(1 + 4 * 2);
        const run = field(["...", "###", "..."]);
        expect(piecesOf(run, 4, 2.4)).toHaveLength(1 + 2 * 2);
        for (const merlon of piecesOf(run, 4, 2.4).slice(1)) expect(merlon.y).toBeCloseTo(run.tiles[4].elevation * QUARTER);
    });

    it("keep a turned piece centred where it was put", () => {
        const [piece] = piecesOf(field(["o"]), 0, 2).filter(p => p.turn !== 0);
        const [x, , z] = pieceCorner(piece);
        const [c, s] = [Math.cos(piece.turn), Math.sin(piece.turn)];
        const [hx, hz] = [piece.sx / 2, piece.sz / 2];
        expect(x + hx * c + hz * s).toBeCloseTo(piece.x + hx);
        expect(z - hx * s + hz * c).toBeCloseTo(piece.z + hz);
    });
});
