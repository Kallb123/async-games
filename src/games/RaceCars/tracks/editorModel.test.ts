import { describe, expect, it } from "vitest";
import { MAX_PLAYERS } from "../board";
import { ANGLET } from "./anglet";
import { ASHCOMBE } from "./ashcombe";
import {
    connectByGeometry,
    derivedRows,
    effectiveExits,
    emptyState,
    fromTrack,
    nextTileId,
    parseDraft,
    printTrackFile,
    pinnedExits,
    sameExits,
    sectionOutOfStep,
    tileHeading,
    toTrack,
    validateTrack,
    gridSlots,
    marksOn,
    withExitToggled,
    withMarkToggled,
    withSectionStepsNamed,
    withTileUnmarked,
    type EditorState,
    type EditorTile,
} from "./editorModel";

/**
 * A tiny driveable circuit: a one-tile start/finish line and a two-tile
 * one-stop corner, two lanes wide, wrapping back to the line. Rows are derived
 * — row 0 is the line, 1-2 the corner — and never written here.
 *
 * Its six tiles are also its six grid slots, which is the smallest thing that
 * can seat a full field: a circuit that does not say which tiles its cars start
 * on is one `validateTrack` refuses (§5.2), however well the road joins up.
 */
function tinyState(): EditorState {
    return emptyState({
        id: "tiny",
        name: "Tiny",
        sections: [
            { id: "sf", name: "Start / Finish", lanes: 2, stops: 0 },
            { id: "bend", name: "The Bend", lanes: 2, stops: 1 },
        ],
        tiles: [
            { id: "sf.1.0", section: "sf", lane: 1, x: 0, y: 0 },
            { id: "sf.2.0", section: "sf", lane: 2, x: 20, y: 0 },
            { id: "bend.1.0", section: "bend", lane: 1, x: 0, y: 20 },
            { id: "bend.2.0", section: "bend", lane: 2, x: 20, y: 20 },
            { id: "bend.1.1", section: "bend", lane: 1, x: 0, y: 40 },
            { id: "bend.2.1", section: "bend", lane: 2, x: 20, y: 40 },
        ],
        grid: ["sf.1.0", "sf.2.0", "bend.1.0", "bend.2.0", "bend.1.1", "bend.2.1"],
    });
}

/**
 * The same circuit with the corner's inside line one tile short, so its lanes
 * run out of step — and with that tile's marks scrubbed, exactly as deleting
 * one in the editor does, so the only thing left to report about it is that
 * five tiles cannot seat six cars.
 */
function skewedState(): EditorState {
    const skewed = tinyState();
    skewed.tiles = skewed.tiles.filter(candidate => candidate.id !== "bend.1.1");
    return { ...skewed, ...withTileUnmarked(skewed, "bend.1.1") };
}

/** What every five-tile fixture reports, and the only thing it should. */
const SHORT_GRID = [expect.stringMatching(/starting grid has 5 of 6/)];

/** One tile, for the geometry fixtures below — all in one unnamed section. */
function tile(id: string, lane: number, x: number, y: number, extra: Partial<EditorTile> = {}): EditorTile {
    return { id, section: "sf", lane, x, y, ...extra };
}

function loose(tiles: EditorTile[], lanes: 2 | 3 = 3): EditorState {
    return emptyState({ sections: [{ id: "sf", name: "Straight", lanes, stops: 0 }], tiles });
}

describe("editor validation", () => {
    it("passes a driveable circuit", () => {
        expect(validateTrack(tinyState()).errors).toEqual([]);
    });

    it("reports a blank track rather than throwing", () => {
        expect(validateTrack(emptyState()).errors[0]).toMatch(/Nothing drawn/);
    });

    it("surfaces an underivable graph as an error, not a crash", () => {
        const broken = tinyState();
        // A hand-drawn step onto a tile that isn't there.
        broken.tiles[0] = { ...broken.tiles[0], exits: ["bend.3.0"] };
        expect(validateTrack(broken).errors[0]).toMatch(/not a tile/);
    });

    it("refuses a band whose lanes run out of step without steps of their own", () => {
        // The mistake sections exist to catch: an inside line drawn shorter
        // than its outside cannot take the "next tile along" rule, because
        // that rule is a statement about lanes that run in step (§5.1).
        const skewed = tinyState();
        skewed.tiles = skewed.tiles.filter(candidate => candidate.id !== "bend.1.1");
        expect(validateTrack(skewed).errors[0]).toMatch(/out of step/);
    });

    it("clears the out-of-step refusal once the section's steps are written down", () => {
        // The author's way out: the geometry's own answer, confirmed rather
        // than left to a rule `deriveTrack` refuses for the section.
        const skewed = skewedState();
        expect(validateTrack(skewed).errors[0]).toMatch(/out of step/);

        const named = { ...skewed, tiles: withSectionStepsNamed(skewed, "bend") };
        expect(validateTrack(named).errors).toEqual(SHORT_GRID);
        // ...and the printed file carries them, so it loads for the same reason.
        expect(printTrackFile(named)).toMatch(/exits: \[/);
    });

    it("warns about a section with no tiles on it", () => {
        const empty = tinyState();
        empty.sections = [...empty.sections, { id: "later", name: "Later", lanes: 3, stops: 0 }];
        expect(validateTrack(empty).warnings.some(warning => /no tiles/.test(warning))).toBe(true);
    });

    it("warns about tiles left behind by a deleted section", () => {
        const orphan = tinyState();
        orphan.sections = orphan.sections.filter(section => section.id !== "bend");
        expect(validateTrack(orphan).warnings.some(warning => /no longer exists/.test(warning))).toBe(true);
    });
});

describe("naming a tile's steps rather than leaning on §5.1's rule", () => {
    /** The tiny circuit with its corner's inside line one tile short. */
    it("knows which sections the default rule is refused for", () => {
        const skewed = skewedState();
        expect(sectionOutOfStep(skewed, "bend")).toBe(true);
        // The start/finish line's own lanes still run in step.
        expect(sectionOutOfStep(skewed, "sf")).toBe(false);
        // ...as do the corner's, once the missing tile is back.
        expect(sectionOutOfStep(tinyState(), "bend")).toBe(false);
    });

    it("freezes the steps a tile is already taking, without changing them", () => {
        // The bug this exists for: a tile whose default steps are already the
        // right ones had no way to say so, because every toggle that lands on
        // the default drops the override again.
        const skewed = skewedState();
        const tile = skewed.tiles.find(candidate => candidate.id === "bend.2.0")!;
        const before = effectiveExits(skewed, tile);
        expect(tile.exits).toBeUndefined();

        const pinned = { ...tile, ...pinnedExits(skewed, tile) };
        expect(pinned.exits).toEqual(before);
        expect(effectiveExits({ ...skewed, tiles: [pinned] }, pinned)).toEqual(before);
    });

    it("leaves steps a tile already named alone when naming a section's", () => {
        const skewed = skewedState();
        skewed.tiles = skewed.tiles.map(candidate => (candidate.id === "bend.1.0"
            ? { ...candidate, exits: ["bend.2.1"] }
            : candidate));

        const named = withSectionStepsNamed(skewed, "bend");
        expect(named.find(candidate => candidate.id === "bend.1.0")!.exits).toEqual(["bend.2.1"]);
        // ...and every other tile in the section now carries its own.
        expect(named.filter(candidate => candidate.section === "bend").every(candidate => candidate.exits)).toBe(true);
        // A tile outside the section is untouched.
        expect(named.find(candidate => candidate.id === "sf.1.0")!.exits).toBeUndefined();
    });

    it("keeps an edit that lands on the default where the rule is refused", () => {
        // The promise `docs/admin-tools.md` makes: toggling a step off and on
        // again cannot un-name a tile's steps in an out-of-step section, or an
        // author would put the refusal back without meaning to.
        const skewed = { ...skewedState(), tiles: withSectionStepsNamed(skewedState(), "bend") };
        const tile = skewed.tiles.find(candidate => candidate.id === "bend.2.0")!;
        const step = tile.exits![0];

        const off = { ...skewed, tiles: withExitToggled(skewed, tile.id, step) };
        const backOn = withExitToggled(off, tile.id, step);
        const settled = backOn.find(candidate => candidate.id === tile.id)!;
        expect(settled.exits).toEqual(tile.exits);
        expect(validateTrack({ ...skewed, tiles: backOn }).errors).toEqual(SHORT_GRID);
    });

    it("still drops an override that lands on the default where it is allowed", () => {
        // The ordinary case, unchanged: a straight prints plain rather than
        // hand-written, so the two rules don't collapse into one.
        const tiny = tinyState();
        const tile = tiny.tiles.find(candidate => candidate.id === "bend.2.0")!;
        const step = effectiveExits(tiny, tile)[0];

        const off = { ...tiny, tiles: withExitToggled(tiny, tile.id, step) };
        expect(off.tiles.find(candidate => candidate.id === tile.id)!.exits).toBeDefined();
        const backOn = withExitToggled(off, tile.id, step);
        expect(backOn.find(candidate => candidate.id === tile.id)!.exits).toBeUndefined();
    });

    it("hands an auto-connected set over as the tile's own", () => {
        const skewed = skewedState();
        skewed.tiles = skewed.tiles.map(candidate => (candidate.id === "bend.2.0"
            ? { ...candidate, exits: ["bend.2.1"], autoExits: true }
            : candidate));
        const tile = skewed.tiles.find(candidate => candidate.id === "bend.2.0")!;

        const pinned = pinnedExits(skewed, tile);
        expect(pinned.exits).toEqual(["bend.2.1"]);
        // No longer auto-connect's to redraw — an author has confirmed it.
        expect(pinned.autoExits).toBeUndefined();
    });
});

describe("rows are derived from the steps, never typed", () => {
    it("numbers each section from where the one before it ended", () => {
        expect([...derivedRows(validateTrack(tinyState()).derived).entries()]).toEqual([
            ["sf.1.0", 0],
            ["sf.2.0", 0],
            ["bend.1.0", 1],
            ["bend.1.1", 2],
            ["bend.2.0", 1],
            ["bend.2.1", 2],
        ]);
    });

    it("bands a corner by the rows its own section landed on", () => {
        expect(validateTrack(tinyState()).derived!.corners).toEqual([
            { id: "bend", name: "The Bend", from: 1, to: 2, stops: 1 },
        ]);
    });

    it("spreads a lane that takes fewer tiles across the rows it saved", () => {
        // The shape the old model could not hold: an inside line of two tiles
        // where the outside takes four. Both lanes are level again at the sync
        // line, and no step fails to move the car forward.
        const kettle = emptyState({
            id: "k",
            sections: [
                { id: "sf", name: "Line", lanes: 2, stops: 0 },
                { id: "bend", name: "Bend", lanes: 2, stops: 1 },
            ],
            tiles: [
                tile("sf.1.0", 1, 0, 0),
                tile("sf.2.0", 2, 20, 0),
                { id: "bend.2.0", section: "bend", lane: 2, x: 20, y: 10, exits: ["bend.2.1"] },
                { id: "bend.2.1", section: "bend", lane: 2, x: 20, y: 20, exits: ["bend.2.2"] },
                { id: "bend.2.2", section: "bend", lane: 2, x: 20, y: 30, exits: ["bend.2.3"] },
                { id: "bend.2.3", section: "bend", lane: 2, x: 20, y: 40, exits: ["sf.1.0", "sf.2.0"] },
                { id: "bend.1.0", section: "bend", lane: 1, x: 0, y: 15, exits: ["bend.1.1"] },
                { id: "bend.1.1", section: "bend", lane: 1, x: 0, y: 35, exits: ["sf.1.0", "sf.2.0"] },
            ],
            grid: ["sf.1.0", "sf.2.0", "bend.2.0", "bend.2.1", "bend.1.0", "bend.1.1"],
        });
        const rows = derivedRows(validateTrack(kettle).derived);
        expect(rows.get("bend.2.0")).toBe(1);
        expect(rows.get("bend.2.3")).toBe(4);
        // Two tiles centred in the same four rows rather than bunched at one end.
        expect(rows.get("bend.1.0")).toBe(2);
        expect(rows.get("bend.1.1")).toBe(3);
        expect(validateTrack(kettle).errors).toEqual([]);
    });
});

describe("headings follow the exits when not set by hand", () => {
    it("points straight down a lane", () => {
        const state = tinyState();
        // sf.1.0 → bend.1.0 / bend.2.0; the mean is down and slightly across.
        expect(tileHeading(state, state.tiles[0])).toBeGreaterThan(45);
        expect(tileHeading(state, state.tiles[0])).toBeLessThan(90);
    });

    it("honours a hand-set heading", () => {
        const state = tinyState();
        state.tiles[0].heading = 123;
        expect(tileHeading(state, state.tiles[0])).toBe(123);
    });
});

describe("round-tripping a shipped track", () => {
    it("loads Ashcombe and validates it", () => {
        const state = fromTrack(ASHCOMBE);
        expect(state.tiles).toHaveLength(ASHCOMBE.spaces.length);
        expect(validateTrack(state).errors).toEqual([]);
    });

    it("reads its corners back as sections, with the straights between them", () => {
        expect(fromTrack(ASHCOMBE).sections.map(section => [section.id, section.stops])).toEqual([
            ["straight1", 0],
            ["hairpin", 2],
            ["straight2", 0],
            ["gravel", 1],
            ["straight3", 0],
            ["kink", 1],
            ["straight4", 0],
        ]);
    });

    it("rebuilds the same graph it came from, rows included", () => {
        const rebuilt = toTrack(fromTrack(ASHCOMBE));
        expect(rebuilt.rows).toBe(ASHCOMBE.rows);
        expect(rebuilt.spaces).toHaveLength(ASHCOMBE.spaces.length);
        for (const space of rebuilt.spaces) {
            const original = ASHCOMBE.spaces.find(other => other.row === space.row && other.lane === space.lane)!;
            expect(original).toBeDefined();
            expect(sameExits(
                space.exits.map(exit => `${exit.row}:${exit.lane}`),
                original.exits.map(exit => `${exit.row}:${exit.lane}`),
            )).toBe(true);
        }
    });

    it("keeps Ashcombe's corner bands", () => {
        expect(validateTrack(fromTrack(ASHCOMBE)).derived!.corners).toEqual(ASHCOMBE.corners);
    });
});

describe("the printed track file", () => {
    it("prints a compilable-looking module that names the const after the id", () => {
        const source = printTrackFile(tinyState());
        expect(source).toContain("export const TINY: RaceCarsTrack");
        expect(source).toContain("deriveTrack(SECTIONS)");
        expect(source).toContain('id: "bend"');
        expect(source).toContain("corner: { stops: 1 }");
    });

    it("prints no row numbers at all — the derivation is the only thing that knows them", () => {
        const source = printTrackFile(tinyState());
        expect(source).not.toMatch(/\brow: \d/);
        expect(source).toContain('id: "bend.1.0", lane: 1');
    });

    it("only prints exits where they override the default rule", () => {
        const source = printTrackFile(tinyState());
        expect(source).not.toContain("exits:");
        expect(effectiveExits(tinyState(), tinyState().tiles[0])).toHaveLength(2);
    });

    it("throws on an underivable track — callers must validate first", () => {
        // The contract the export panel relies on: it only prints when
        // validateTrack is clean, because printTrackFile runs deriveTrack.
        const broken = tinyState();
        broken.tiles[0] = { ...broken.tiles[0], exits: ["nowhere"] };
        expect(validateTrack(broken).errors.length).toBeGreaterThan(0);
        expect(() => printTrackFile(broken)).toThrow(/not a tile/);
    });
});

describe("marks: the grid, the finish line and the oil", () => {
    it("refuses a circuit that has not said where its cars start", () => {
        const ungridded: EditorState = { ...tinyState(), grid: [] };
        expect(validateTrack(ungridded).errors.join(" ")).toMatch(/starting grid has 0 of 6/);
        // ...and the printer refuses it too, for a caller that skipped the check.
        expect(() => printTrackFile(ungridded)).toThrow(/no starting grid/);
    });

    it("refuses a mark on a tile that is not on the drawing", () => {
        // The Anglet failure in the authoring model: a slot naming a space the
        // circuit hasn't got, which a race turns into a car that cannot move.
        const stray = { ...tinyState(), oil: ["nowhere"] };
        expect(validateTrack(stray).errors.join(" ")).toMatch(/Oil names nowhere, which is not a tile/);
    });

    it("numbers the grid in the order the tiles were marked, and renumbers when one comes out", () => {
        const empty = { ...tinyState(), grid: [] };
        const one = { ...empty, grid: withMarkToggled(empty, "grid", "sf.1.0") };
        const two = { ...one, grid: withMarkToggled(one, "grid", "bend.2.1") };
        const three = { ...two, grid: withMarkToggled(two, "grid", "sf.2.0") };
        expect([...gridSlots(three)]).toEqual([["sf.1.0", 1], ["bend.2.1", 2], ["sf.2.0", 3]]);

        // A second click takes the slot back out; the cars behind move up.
        const fewer = { ...three, grid: withMarkToggled(three, "grid", "bend.2.1") };
        expect([...gridSlots(fewer)]).toEqual([["sf.1.0", 1], ["sf.2.0", 2]]);
    });

    it("takes a deleted tile out of every mark it was in", () => {
        const state = { ...tinyState(), finish: ["sf.1.0", "sf.2.0"], oil: ["sf.1.0"] };
        expect(marksOn(state, "sf.1.0")).toEqual(["grid", "finish", "oil"]);
        const scrubbed = withTileUnmarked(state, "sf.1.0");
        expect(scrubbed.grid).not.toContain("sf.1.0");
        expect(scrubbed.finish).toEqual(["sf.2.0"]);
        expect(scrubbed.oil).toEqual([]);
    });

    it("drops a mark naming a tile a reloaded draft no longer has", () => {
        const draft = JSON.stringify({
            ...tinyState(),
            grid: ["sf.1.0", "sf.1.0", "deleted", 7],
            oil: "not a list",
            gridBehindFinishLine: true,
        });
        const reloaded = parseDraft(draft);
        // Each id once, only the ones really drawn, in the order they were marked.
        expect(reloaded.grid).toEqual(["sf.1.0"]);
        expect(reloaded.oil).toEqual([]);
        expect(reloaded.gridBehindFinishLine).toBe(true);
    });

    it("warns about a finish line that leaves a lane open", () => {
        const state = { ...tinyState(), finish: ["sf.1.0"] };
        expect(validateTrack(state).warnings.join(" ")).toMatch(/no tile in lane 2/);
        const across = { ...tinyState(), finish: ["sf.1.0", "sf.2.0"] };
        expect(validateTrack(across).warnings.join(" ")).not.toMatch(/no tile in lane/);
    });

    it("warns when the grid is set behind a finish line nobody has painted", () => {
        const state = { ...tinyState(), gridBehindFinishLine: true };
        expect(validateTrack(state).warnings.join(" ")).toMatch(/no finish line is painted/);
    });

    it("loads a shipped track's grid back as the tiles it stands on", () => {
        const ashcombe = fromTrack(ASHCOMBE);
        expect(ashcombe.grid).toHaveLength(MAX_PLAYERS);
        expect(validateTrack(ashcombe).errors).toEqual([]);
        // P1 first, and on the space Ashcombe deals it to (§5.2).
        expect(toTrack(ashcombe).grid).toEqual(ASHCOMBE.grid);
        expect(toTrack(fromTrack(ANGLET)).grid).toEqual(ANGLET.grid);
    });

    it("prints the marks as tile ids resolved through the derivation", () => {
        const source = printTrackFile({
            ...tinyState(),
            finish: ["sf.1.0", "sf.2.0"],
            oil: ["bend.1.0"],
            gridBehindFinishLine: true,
        });
        expect(source).toContain('grid: spacesOf(DERIVED, ["sf.1.0", "sf.2.0", "bend.1.0", "bend.2.0", "bend.1.1", "bend.2.1"])');
        expect(source).toContain('finish: spacesOf(DERIVED, ["sf.1.0", "sf.2.0"])');
        expect(source).toContain('oil: spacesOf(DERIVED, ["bend.1.0"])');
        expect(source).toContain("gridBehindFinishLine: true");
        // Still not one row number anywhere — a mark names a tile for exactly
        // the reason a step does.
        expect(source).not.toMatch(/\brow: \d/);
    });

    it("leaves out the lines a plain circuit has nothing to say with", () => {
        const source = printTrackFile(tinyState());
        expect(source).toContain("grid: spacesOf(DERIVED, [");
        expect(source).not.toContain("finish:");
        expect(source).not.toContain("oil:");
        expect(source).not.toContain("gridBehindFinishLine");
    });
});

describe("placing tiles", () => {
    it("names the next tile after its section, lane and place in the run", () => {
        const state = tinyState();
        expect(nextTileId(state, "sf", 1)).toBe("sf.1.1");
        expect(nextTileId(state, "bend", 2)).toBe("bend.2.2");
    });
});

describe("parseDraft trusts a saved draft only as far as its shape holds", () => {
    it("round-trips a real draft", () => {
        const state = tinyState();
        const reloaded = parseDraft(JSON.stringify(state));
        expect(reloaded.tiles).toHaveLength(state.tiles.length);
        expect(reloaded.sections.map(section => section.id)).toEqual(["sf", "bend"]);
    });

    it("falls back to a blank track on junk, wrong type, or a bad shape", () => {
        expect(parseDraft(null).tiles).toEqual([]);
        expect(parseDraft("not json{").tiles).toEqual([]);
        expect(parseDraft("42").tiles).toEqual([]);
        expect(parseDraft(JSON.stringify({ tiles: "nope", sections: 5 })).tiles).toEqual([]);
        // A draft with no readable sections still has somewhere to draw.
        expect(parseDraft(JSON.stringify({ tiles: [] })).sections).toHaveLength(1);
    });
});

describe("connectByGeometry lines lanes up off the shape, not the placement order", () => {
    it("leaves an ordinary straight on the default rule", () => {
        const straight = loose([
            tile("sf.1.0", 1, 0, 0), tile("sf.2.0", 2, 20, 0),
            tile("sf.1.1", 1, 0, 20), tile("sf.2.1", 2, 20, 20),
            tile("sf.1.2", 1, 0, 40), tile("sf.2.2", 2, 20, 40),
        ], 2);
        const connected = connectByGeometry(straight);
        for (const id of ["sf.1.0", "sf.2.0", "sf.1.1", "sf.2.1"]) {
            expect(connected.find(candidate => candidate.id === id)!.exits).toBeUndefined();
        }
    });

    it("keeps a hand-drawn override untouched", () => {
        const state = tinyState();
        state.tiles[0] = { ...state.tiles[0], exits: ["bend.2.0"] };
        const connected = connectByGeometry(state);
        expect(connected[0].exits).toEqual(["bend.2.0"]);
        expect(connected[0].autoExits).toBeUndefined();
    });

    it("never connects across more than one lane, even when that tile is the closest", () => {
        // Lane 3 sits physically nearest lane 1 on the next row — a three-lane
        // road pinched into a sharp bend — but a car may only ever step into
        // this lane or the one next to it (§5.1).
        const pinched = loose([
            tile("sf.1.0", 1, 0, 0), tile("sf.2.0", 2, 20, 0), tile("sf.3.0", 3, 40, 0),
            tile("sf.3.1", 3, 2, 20), tile("sf.2.1", 2, 20, 20), tile("sf.1.1", 1, 40, 20),
        ]);
        const connected = connectByGeometry(pinched);
        const state = loose(connected);
        const exits = effectiveExits(state, connected.find(candidate => candidate.id === "sf.1.0")!);
        const lanes = exits.map(exit => connected.find(candidate => candidate.id === exit)!.lane);
        expect(lanes.every(lane => Math.abs(lane - 1) <= 1)).toBe(true);
    });

    it("connects a lane change the default rule cannot reach, and marks it auto", () => {
        // Lane 2 has run out of tiles at this point in the section, so "the
        // next tile along in the lane beside me" finds nothing — but a tile is
        // plainly there on the art, farther off than staying in lane the way a
        // wide road's lane change always is.
        const wide = loose([
            tile("sf.3.0", 3, 390, 180),
            tile("sf.3.1", 3, 270, 180),
            tile("sf.2.0", 2, 210, 100),
        ]);
        const connected = connectByGeometry(wide);
        const from = connected.find(candidate => candidate.id === "sf.3.0")!;
        expect(from.autoExits).toBe(true);
        expect(from.exits).toContain("sf.3.1");
        expect(from.exits).toContain("sf.2.0");
    });

    it("redraws its own auto exits on a second pass instead of freezing them", () => {
        let state = loose([
            tile("sf.3.0", 3, 390, 180),
            tile("sf.3.1", 3, 270, 180),
            tile("sf.2.0", 2, 210, 100),
        ]);
        state = loose(connectByGeometry(state));
        expect(state.tiles.find(candidate => candidate.id === "sf.3.0")!.autoExits).toBe(true);

        // Give lane 2 a tile the default rule can reach, and the override it
        // wrote is dropped rather than left pointing at the old target.
        state = loose([...state.tiles, tile("sf.2.1", 2, 270, 100)]);
        state = loose(connectByGeometry(state));
        const redrawn = state.tiles.find(candidate => candidate.id === "sf.3.0")!;
        expect(redrawn.exits).toBeUndefined();
        expect(redrawn.autoExits).toBeUndefined();
    });

    it("ignores a stale auto exit from a previous run when aiming the search", () => {
        // A's exits claim (wrongly, as if left over from an earlier, buggy run)
        // that it only reaches the far tile C. If that stale exit fed this run's
        // heading, the search would aim toward C alone and miss B — the close,
        // straight-ahead, same-lane tile — entirely.
        const state = loose([
            tile("sf.1.0", 1, 0, 0, { exits: ["sf.2.0"], autoExits: true }),
            tile("sf.1.1", 1, 0, 10),
            tile("sf.2.0", 2, 20, 10),
        ]);
        const connected = connectByGeometry(state);
        const exits = effectiveExits(loose(connected), connected.find(candidate => candidate.id === "sf.1.0")!);
        expect(exits).toContain("sf.1.1");
        expect(exits).toContain("sf.2.0");
    });

    it("is stable across repeated runs — a second pass matches the first when nothing moved", () => {
        const state = loose([
            tile("sf.3.0", 3, 390, 180),
            tile("sf.3.1", 3, 270, 180),
            tile("sf.2.0", 2, 210, 100),
        ]);
        const once = connectByGeometry(state);
        const twice = connectByGeometry(loose(once));
        expect(twice).toEqual(once);
    });

    it("never reverses an existing exit, picking the next-nearest tile in that lane instead", () => {
        // X already steps to Y (hand-drawn). Y's own forward search is aimed
        // (via an explicit heading, to make the test deterministic) straight
        // back at X — the nearest candidate in lane 1 — with W a little farther
        // beyond it in the same direction. Y must not retrace X's line
        // backwards; it should fall through to W instead.
        const state = loose([
            // W first, so the default rule has nothing to say about Y and the
            // geometry is what answers.
            tile("w", 1, 0, -20),
            tile("x", 1, 0, 0, { exits: ["y"] }),
            tile("y", 1, 0, 10, { heading: -90 }),
        ]);
        const connected = connectByGeometry(state);
        const exits = effectiveExits(loose(connected), connected.find(candidate => candidate.id === "y")!);
        expect(exits).toEqual(["w"]);
        expect(exits).not.toContain("x");
    });

    it("drops the lane rather than reversing an exit when nothing else is ahead", () => {
        const state = loose([
            tile("x", 1, 0, 0, { exits: ["y"] }),
            tile("y", 1, 0, 10, { heading: -90 }),
        ]);
        // Nothing is written: the geometry finds no candidate in lane 1 that it
        // is allowed to point at. (On this one-section fixture the default rule
        // still wraps Y round to X, which a real lap's next section would be.)
        const connected = connectByGeometry(state);
        expect(connected.find(candidate => candidate.id === "y")!.exits).toBeUndefined();
        expect(connected.find(candidate => candidate.id === "y")!.autoExits).toBeUndefined();
    });
});

describe("a grid behind a line that spans rows", () => {
    // The line's earliest row is the boundary (§15), so a slot on a later row of
    // the same line is past it — behind the line in its own lane and over it as
    // far as the lap is concerned. Seated a lap short, that car drives the whole
    // circuit before it banks anything.
    const behind = (grid: string[], finish: string[]): EditorState => ({
        ...tinyState(),
        grid,
        finish,
        gridBehindFinishLine: true,
    });

    it("refuses the slots that are not behind the line", () => {
        // Rows: sf.*.0 is row 0, bend.*.0 row 1, bend.*.1 row 2. With the line on
        // row 0 only rows 2 are behind it — P1/P2 stand on the line itself and
        // P3/P4 are a row past it.
        const state = behind(["sf.1.0", "sf.2.0", "bend.1.0", "bend.2.0", "bend.1.1", "bend.2.1"], ["sf.1.0", "sf.2.0"]);
        const stray = validateTrack(state).errors.filter(error => error.includes("behind the finish line"));
        expect(stray).toHaveLength(1);
        expect(stray[0]).toContain("P1, P2, P3, P4");
    });

    it("accepts a grid wholly behind the line, wrap and all", () => {
        const state = behind(["bend.1.1", "bend.2.1", "bend.1.1", "bend.2.1", "bend.1.1", "bend.2.1"], ["sf.1.0", "sf.2.0"]);
        expect(validateTrack(state).errors.filter(error => error.includes("behind the finish line"))).toEqual([]);
    });
});
