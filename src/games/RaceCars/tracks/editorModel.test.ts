import { describe, expect, it } from "vitest";
import { ASHCOMBE } from "./ashcombe";
import {
    buildCorners,
    effectiveExits,
    emptyState,
    fromTrack,
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

    it("warns when a corner band is not one unbroken run of rows", () => {
        const gapped = tinyState();
        // Tag rows 0 and 2 but leave row 1 out, leaving a hole in the band.
        gapped.tiles[0].cornerId = "bend";
        gapped.tiles[1].cornerId = "bend";
        gapped.tiles[2].cornerId = undefined;
        gapped.tiles[3].cornerId = undefined;
        expect(validateTrack(gapped).warnings.some(w => /unbroken band/.test(w))).toBe(true);
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
});
