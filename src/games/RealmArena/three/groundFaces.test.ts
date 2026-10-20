import { describe, expect, it } from "vitest";
import { buildBattlefield, FULL_HEIGHT } from "@/utils/games/battlefield/terrain";
import { groundFaces } from "./groundFaces";
import { BOARD_DEPTH, QUARTER, type Vec3 } from "./iso3d";

const field = (rows: string[], elevation?: string[]) => buildBattlefield({ name: "test", rows, elevation, deployments: [], objectives: {} });

const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

describe("the ground's faces", () => {
    it("are a slab a full height thick under flat ground: a side along each edge of the map, and no tops", () => {
        const faces = groundFaces(field(["...", "...", "..."]));
        expect(BOARD_DEPTH).toBeGreaterThanOrEqual(FULL_HEIGHT);
        expect(faces).toHaveLength(4 * 3);
        for (const { corners, normal } of faces) {
            expect(normal[1]).toBe(0);
            expect(Math.min(...corners.map(c => c[1]))).toBeCloseTo(-BOARD_DEPTH * QUARTER);
            expect(Math.max(...corners.map(c => c[1]))).toBe(0);
        }
    });

    it("stand raised ground on a plinth, with a top and a side only where its neighbour is lower", () => {
        const map = field(["...", "...", "..."], ["000", "020", "000"]);
        const faces = groundFaces(map).filter(face => face.square === 4);
        expect(faces).toHaveLength(5);
        expect(faces.filter(face => face.normal[1] === 1)).toHaveLength(1);
        for (const side of faces.filter(face => face.normal[1] === 0)) {
            expect(Math.min(...side.corners.map(c => c[1]))).toBe(0);
            expect(Math.max(...side.corners.map(c => c[1]))).toBeCloseTo(2 * QUARTER);
        }
        // Two raised squares side by side build no side between them.
        const pair = groundFaces(field(["....", "....", "...."], ["0000", "0220", "0000"])).filter(face => face.square === 5 || face.square === 6);
        expect(pair.filter(face => face.normal[1] === 0)).toHaveLength(6);
    });

    it("put a plinth under what stands on raised ground, up to its ground and not its top", () => {
        const faces = groundFaces(field(["...", ".#.", "..."], ["000", "010", "000"])).filter(face => face.square === 4);
        expect(faces.find(face => face.normal[1] === 1)!.corners[0][1]).toBeCloseTo(QUARTER);
        // A wall on flat ground needs none.
        expect(groundFaces(field(["...", ".#.", "..."])).filter(face => face.square === 4)).toHaveLength(0);
    });

    it("run every face's corners anticlockwise seen from the way it faces, with its picture on its own square", () => {
        for (const { corners, normal, cell } of groundFaces(field(["...", "...", "..."], ["010", "131", "010"]))) {
            const turn = cross(minus(corners[1], corners[0]), minus(corners[2], corners[0]));
            expect(turn[0] * normal[0] + turn[1] * normal[1] + turn[2] * normal[2]).toBeGreaterThan(0);
            for (const [u, v] of cell) for (const at of [u, v]) expect(at).toBeGreaterThanOrEqual(0), expect(at).toBeLessThanOrEqual(1);
        }
    });
});
