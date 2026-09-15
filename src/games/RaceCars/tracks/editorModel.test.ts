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
    type EditorTile,
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

    it("accepts a corner that takes only some lanes of a row (the inside line)", () => {
        // The inside line is in the corner for fewer rows than the outside:
        // untag row 1 lane 1 but keep it on lane 2 and both of row 2. Valid,
        // no error, no warning about coverage.
        const inside = tinyState();
        inside.tiles[2].cornerId = undefined; // row 1 lane 1 leaves the corner early
        expect(validateTrack(inside).errors).toEqual([]);
        expect(validateTrack(inside).warnings.some(w => /cover|lane|gap/.test(w))).toBe(false);
    });

    it("warns about a tile painted with a corner that no longer exists", () => {
        const orphan = tinyState();
        delete orphan.corners.bend; // corner removed, tiles still carry its id
        expect(validateTrack(orphan).warnings.some(w => /no longer exists/.test(w))).toBe(true);
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

describe("per-tile corner membership survives the round trip", () => {
    it("carries cornerId onto the spaces and reads it straight back", () => {
        const inside = tinyState();
        inside.tiles[2].cornerId = undefined; // row 1 lane 1 leaves the corner early
        const track = toTrack(inside);
        expect(track.spaces.find(s => s.row === 1 && s.lane === 1)!.cornerId).toBeUndefined();
        expect(track.spaces.find(s => s.row === 1 && s.lane === 2)!.cornerId).toBe("bend");
        const reloaded = fromTrack(track);
        expect(reloaded.tiles.find(t => t.row === 1 && t.lane === 1)!.cornerId).toBeUndefined();
        expect(reloaded.tiles.find(t => t.row === 1 && t.lane === 2)!.cornerId).toBe("bend");
    });

    it("prints cornerId in the track file", () => {
        expect(printTrackFile(tinyState())).toContain('cornerId: "bend"');
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
        // geometry can. On this 3-row wrap 2:1's own untouched default happens
        // to point straight back to 0:1, which also guards the "only an
        // explicit exit blocks a reversal" rule below: if a plain row+1
        // default counted as "already connected", it would wrongly exclude
        // 2:1 here and this would fail.
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

    it("never connects across more than one lane, even when that tile is the closest", () => {
        // Lane 3 sits physically nearest 0:1 on the next row — a three-lane road
        // pinched into a sharp bend — but a car may only ever step into this lane
        // or the one next to it (§5.1), so geometry must not offer lane 3 however
        // close it is.
        const pinched = emptyState({
            tiles: [
                { row: 0, lane: 1, x: 0, y: 0 },
                { row: 0, lane: 2, x: 20, y: 0 },
                { row: 0, lane: 3, x: 40, y: 0 },
                { row: 1, lane: 3, x: 2, y: 20 },
                { row: 1, lane: 2, x: 20, y: 20 },
                { row: 1, lane: 1, x: 40, y: 20 },
            ],
        });
        const connected = connectByGeometry(pinched.tiles);
        const fromLane1 = connected.find(t => t.row === 0 && t.lane === 1)!;
        expect((fromLane1.exits ?? []).every(e => Math.abs(e.lane - 1) <= 1)).toBe(true);
    });

    it("marks what it writes as auto so a later pass may redraw it", () => {
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
        expect(inside.autoExits).toBe(true);
    });

    it("redraws its own auto exits on a second pass instead of freezing them", () => {
        // First pass draws 0:1 -> 2:1 off the gap on row 1 (no lane-1 tile
        // there yet). Add a real 1:1 to close that gap — a second pass must
        // follow the tiles rather than keep repeating what it wrote before,
        // and since row+1 now lines up on its own the stale override is
        // dropped entirely rather than left pointing at the old target.
        let tiles: EditorTile[] = [
            { row: 0, lane: 1, x: 0, y: 0 },
            { row: 0, lane: 2, x: 30, y: 0 },
            { row: 1, lane: 2, x: 30, y: 20 },
            { row: 2, lane: 1, x: 0, y: 40 },
            { row: 2, lane: 2, x: 30, y: 40 },
        ];
        tiles = connectByGeometry(tiles);
        const firstPass = tiles.find(t => t.row === 0 && t.lane === 1)!;
        expect(firstPass.autoExits).toBe(true);
        expect(firstPass.exits!.some(e => e.row === 2 && e.lane === 1)).toBe(true);

        tiles = [...tiles, { row: 1, lane: 1, x: 0, y: 20 }];
        tiles = connectByGeometry(tiles);
        const redrawn = tiles.find(t => t.row === 0 && t.lane === 1)!;
        expect(redrawn.exits).toBeUndefined();
        expect(redrawn.autoExits).toBeUndefined();
    });

    it("connects a wide road's lane change even when it sits farther off than staying in lane", () => {
        // The lane-2 tile ahead of 7:3 sits noticeably farther away than the
        // lane-3 tile ahead of it does — the lane offset a wide road draws —
        // at close to the ~1.64x ratio that used to fall just outside a single
        // "close enough to the nearest tile overall" cutoff shared across
        // lanes, and so dropped the lane change entirely: exactly the bug
        // report, a three-lane row that only ever connected straight ahead,
        // never to the lane beside it. 7:2 sits on 7:3's own row and must
        // never be offered — same row is never a valid step (a car changes
        // lane while moving, never on the spot).
        const wide = emptyState({
            tiles: [
                { row: 7, lane: 3, x: 390, y: 180 },
                { row: 8, lane: 3, x: 270, y: 180 },
                { row: 8, lane: 2, x: 210, y: 100 },
                { row: 7, lane: 2, x: 320, y: 100 },
            ],
        });
        const connected = connectByGeometry(wide.tiles);
        const from = connected.find(t => t.row === 7 && t.lane === 3)!;
        const exits = effectiveExits(connected, from);
        expect(exits.some(e => e.row === 8 && e.lane === 3)).toBe(true);
        expect(exits.some(e => e.row === 8 && e.lane === 2)).toBe(true);
        expect(exits.every(e => e.row !== 7)).toBe(true);
    });

    it("never reverses an existing exit, picking the next-nearest tile in that lane instead", () => {
        // X already steps to Y (hand-drawn). Y's own forward search is aimed
        // (via an explicit heading, to make the test deterministic) straight
        // back at X — the nearest candidate in lane 1 — with W a little
        // farther beyond it in the same direction. Y must not retrace X's
        // line backwards; it should fall through to W instead.
        const x: EditorTile = { row: 5, lane: 1, x: 0, y: 0, exits: [{ row: 6, lane: 1 }] };
        const y: EditorTile = { row: 6, lane: 1, x: 0, y: 10, heading: -90 };
        const w: EditorTile = { row: 4, lane: 1, x: 0, y: -20 };
        const connected = connectByGeometry([x, y, w]);
        const fromY = connected.find(t => t.row === 6 && t.lane === 1)!;
        expect(fromY.exits).toEqual([{ row: 4, lane: 1 }]);
        expect(fromY.exits!.some(e => e.row === 5 && e.lane === 1)).toBe(false);
    });

    it("drops the lane rather than reversing an exit when nothing else is ahead", () => {
        // Same as above but without W to fall back on: Y must end up with no
        // step in lane 1 at all, not a reversal of X's line.
        const x: EditorTile = { row: 5, lane: 1, x: 0, y: 0, exits: [{ row: 6, lane: 1 }] };
        const y: EditorTile = { row: 6, lane: 1, x: 0, y: 10, heading: -90 };
        const connected = connectByGeometry([x, y]);
        const fromY = connected.find(t => t.row === 6 && t.lane === 1)!;
        expect(fromY.exits).toBeUndefined();
    });

    it("never touches a hand-drawn exit, even one that could be redrawn", () => {
        const state = tinyState();
        state.tiles[0] = { row: 0, lane: 1, x: 0, y: 0, exits: [{ row: 1, lane: 2 }] };
        const connected = connectByGeometry(state.tiles);
        const tile = connected.find(t => t.row === 0 && t.lane === 1)!;
        expect(tile.exits).toEqual([{ row: 1, lane: 2 }]);
        expect(tile.autoExits).toBeUndefined();
    });
});
