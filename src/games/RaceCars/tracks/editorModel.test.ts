import { describe, expect, it } from "vitest";
import { ASHCOMBE } from "./ashcombe";
import {
    buildCorners,
    connectByGeometry,
    effectiveExits,
    emptyState,
    fromTrack,
    parseDraft,
    printTrackFile,
    sameExits,
    tileHeading,
    toTrack,
    validateTrack,
    type EditorState,
} from "./editorModel";

// A tiny driveable circuit: three rows of two lanes, wrapping row 2 → row 0,
// with a one-stop corner painted on rows 1-2.
function tinyState(): EditorState {
    return emptyState({
        id: "tiny",
        name: "Tiny",
        tiles: [
            { row: 0, lane: 1, x: 0, y: 0 },
            { row: 0, lane: 2, x: 20, y: 0 },
            { row: 1, lane: 1, x: 0, y: 20, cornerId: "bend" },
            { row: 1, lane: 2, x: 20, y: 20, cornerId: "bend" },
            { row: 2, lane: 1, x: 0, y: 40, cornerId: "bend" },
            { row: 2, lane: 2, x: 20, y: 40, cornerId: "bend" },
        ],
        corners: { bend: { name: "The Bend", stops: 1 } },
    });
}

describe("editor validation", () => {
    it("passes a driveable circuit", () => {
        expect(validateTrack(tinyState()).errors).toEqual([]);
    });

    it("reports a blank track rather than throwing", () => {
        expect(validateTrack(emptyState()).errors[0]).toMatch(/Nothing drawn/);
    });

    it("surfaces an undriveable graph as an error, not a crash", () => {
        const broken = tinyState();
        // A hand-drawn exit onto a space that isn't there.
        broken.tiles[0] = { row: 0, lane: 1, x: 0, y: 0, exits: [{ row: 1, lane: 3 }] };
        expect(validateTrack(broken).errors[0]).toMatch(/not a space/);
    });

    it("does not force every tile in a corner's rows to be tagged", () => {
        // A corner can span its rows in a strange way — only some lanes on a
        // row — and that is not a problem to warn about.
        const partial = tinyState();
        partial.tiles[2].cornerId = undefined; // untag row 1 lane 1, keep lane 2
        expect(validateTrack(partial).warnings.some(w => /unbroken|skips/.test(w))).toBe(false);
        expect(validateTrack(partial).errors).toEqual([]);
    });

    it("warns about an exit that runs more than half a lap forward", () => {
        // A backward-looking override — the row-numbering slip a sharp corner sets.
        const backwards = tinyState();
        backwards.tiles[5] = { row: 2, lane: 2, x: 20, y: 40, cornerId: "bend", exits: [{ row: 1, lane: 1 }] };
        expect(validateTrack(backwards).warnings.some(w => /half a lap/.test(w))).toBe(true);
    });
});

describe("corners are read off the tiles that carry them", () => {
    it("bands a corner by the rows of its tiles", () => {
        expect(buildCorners(tinyState())).toEqual([
            { id: "bend", name: "The Bend", from: 1, to: 2, stops: 1 },
        ]);
    });

    it("drops a corner nothing is tagged with", () => {
        const state = tinyState();
        state.corners.ghost = { name: "Ghost", stops: 2 };
        expect(buildCorners(state).map(c => c.id)).toEqual(["bend"]);
    });
});

describe("headings follow the exits when not set by hand", () => {
    it("points straight down a lane", () => {
        const state = tinyState();
        // row 0 lane 1 → row 1 lane 1/2; mean is down and slightly across.
        expect(tileHeading(state.tiles, state.tiles[0])).toBeGreaterThan(45);
        expect(tileHeading(state.tiles, state.tiles[0])).toBeLessThan(90);
    });

    it("honours a hand-set heading", () => {
        const state = tinyState();
        state.tiles[0].heading = 123;
        expect(tileHeading(state.tiles, state.tiles[0])).toBe(123);
    });
});

describe("round-tripping a shipped track", () => {
    it("loads Ashcombe and validates it", () => {
        const state = fromTrack(ASHCOMBE);
        expect(state.tiles).toHaveLength(ASHCOMBE.spaces.length);
        expect(validateTrack(state).errors).toEqual([]);
    });

    it("rebuilds the same graph it came from", () => {
        const rebuilt = toTrack(fromTrack(ASHCOMBE));
        expect(rebuilt.rows).toBe(ASHCOMBE.rows);
        expect(rebuilt.spaces).toHaveLength(ASHCOMBE.spaces.length);
        // Ordinary straights keep §5.1's default rather than becoming overrides.
        for (const space of rebuilt.spaces) {
            const original = ASHCOMBE.spaces.find(s => s.row === space.row && s.lane === space.lane)!;
            expect(sameExits(space.exits, original.exits)).toBe(true);
        }
    });

    it("keeps Ashcombe's corner bands", () => {
        expect(buildCorners(fromTrack(ASHCOMBE))).toEqual(ASHCOMBE.corners);
    });
});

describe("the printed track file", () => {
    it("prints a compilable-looking module that names the const after the id", () => {
        const source = printTrackFile(tinyState());
        expect(source).toContain("export const TINY: RaceCarsTrack");
        expect(source).toContain("assembleSpaces(TILES, ROWS)");
        expect(source).toContain("const ROWS = 3;");
        expect(source).toContain('id: "bend"');
    });

    it("only prints exits where they override the default rule", () => {
        const source = printTrackFile(tinyState());
        // A tidy straight tile has no exits array printed.
        expect(source).toContain("{ row: 0, lane: 1 },");
        expect(effectiveExits(tinyState().tiles, tinyState().tiles[0])).toHaveLength(2);
    });

    it("throws on an undriveable track — callers must validate first", () => {
        // The contract the export panel relies on: it only prints when
        // validateTrack is clean, because printTrackFile runs assembleSpaces.
        const broken = tinyState();
        broken.tiles[0] = { row: 0, lane: 1, x: 0, y: 0, exits: [{ row: 9, lane: 9 }] };
        expect(validateTrack(broken).errors.length).toBeGreaterThan(0);
        expect(() => printTrackFile(broken)).toThrow(/not a space/);
    });
});

describe("parseDraft trusts a saved draft only as far as its shape holds", () => {
    it("round-trips a real draft", () => {
        const state = tinyState();
        expect(parseDraft(JSON.stringify(state)).tiles).toHaveLength(state.tiles.length);
    });

    it("falls back to a blank track on junk, wrong type, or a bad shape", () => {
        expect(parseDraft(null).tiles).toEqual([]);
        expect(parseDraft("not json{").tiles).toEqual([]);
        expect(parseDraft("42").tiles).toEqual([]);
        expect(parseDraft(JSON.stringify({ tiles: "nope", corners: 5 })).tiles).toEqual([]);
    });
});

describe("connectByGeometry lines lanes up off the shape, not the row numbers", () => {
    it("leaves an interior straight on the default rule", () => {
        // Two lanes running straight down: on the interior rows geometry agrees
        // with row+1, so no override is written. (The last row wraps to the
        // first, whose forward direction on an open test strip points back up —
        // a real loop closes that; here it is enough that the straight does.)
        const straight = emptyState({
            tiles: [
                { row: 0, lane: 1, x: 0, y: 0 }, { row: 0, lane: 2, x: 20, y: 0 },
                { row: 1, lane: 1, x: 0, y: 20 }, { row: 1, lane: 2, x: 20, y: 20 },
                { row: 2, lane: 1, x: 0, y: 40 }, { row: 2, lane: 2, x: 20, y: 40 },
            ],
        });
        const connected = connectByGeometry(straight.tiles);
        for (const [row, lane] of [[0, 1], [0, 2], [1, 1], [1, 2]] as const) {
            expect(connected.find(t => t.row === row && t.lane === lane)!.exits).toBeUndefined();
        }
    });

    it("keeps a hand-drawn override untouched", () => {
        const state = tinyState();
        state.tiles[0] = { row: 0, lane: 1, x: 0, y: 0, exits: [{ row: 1, lane: 2 }] };
        const connected = connectByGeometry(state.tiles);
        expect(connected[0].exits).toEqual([{ row: 1, lane: 2 }]);
    });

    it("connects to the tile that is physically ahead when a lane skips a row", () => {
        // A sharp inside line: lane 1 has no tile on row 1, so the tile that is
        // actually in front of 0:1 is 2:1 — which the row+1 rule can't reach but
        // geometry can.
        const corner = emptyState({
            tiles: [
                { row: 0, lane: 1, x: 0, y: 0 },
                { row: 0, lane: 2, x: 30, y: 0 },
                { row: 1, lane: 2, x: 30, y: 20 },
                { row: 2, lane: 1, x: 0, y: 40 },
                { row: 2, lane: 2, x: 30, y: 40 },
            ],
        });
        const connected = connectByGeometry(corner.tiles);
        const inside = connected.find(t => t.row === 0 && t.lane === 1)!;
        expect(inside.exits).toBeDefined();
        expect(inside.exits!.some(e => e.row === 2 && e.lane === 1)).toBe(true);
    });
});
