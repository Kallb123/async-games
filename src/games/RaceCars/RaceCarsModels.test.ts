import { describe, expect, it } from "vitest";
import {
    buildInitialRaceCarsState,
    cloneRaceCarsState,
    gameStateToModel,
} from "./RaceCarsModels";
import {
    DEFAULT_DISTANCE,
    DEFAULT_SPEC,
    MAX_PLAYERS,
    RACE_DISTANCES,
    SPECS,
    distanceDef,
    readRaceSettings,
    specDef,
    trackById,
    DEFAULT_TRACK_ID,
} from "./board";
import { mongoMap } from "@/utils/games/mongoMaps";
import type { IRaceCarsPlayerState } from "./rules";

const NAMES = { u1: "Alice", u2: "Bob", u3: "Carol" };
const TURN_ORDER = ["u1", "u2", "u3"];
const SPRINT = { distance: "sprint", spec: "balanced", oilSpills: false } as const;
const TRACK = trackById(DEFAULT_TRACK_ID);

describe("buildInitialRaceCarsState — the grid (§6)", () => {
    it("deals the field into §5.2's staggered grid slots, P1 first", () => {
        const state = buildInitialRaceCarsState(TURN_ORDER, SPRINT);

        const cars = TURN_ORDER.map(userId => mongoMap(state.players).get(userId)!);
        expect(cars.map(ps => ({ row: ps.row, lane: ps.lane }))).toEqual(TRACK.grid.slice(0, TURN_ORDER.length));
        // The race number *is* the grid slot, and it's the second identity
        // channel beside colour (§19), so it must never repeat.
        expect(cars.map(ps => ps.raceNumber)).toEqual([1, 2, 3]);
    });

    it("starts every car identical: gear 0, full pools, no stops banked (§5.3)", () => {
        const state = buildInitialRaceCarsState(TURN_ORDER, { ...SPRINT, spec: "stopper" });
        const spec = specDef("stopper");

        for (const userId of TURN_ORDER) {
            const ps = mongoMap(state.players).get(userId)!;
            expect(ps.gear).toBe(0);
            expect({ tyres: ps.tyres, brakes: ps.brakes, gearbox: ps.gearbox })
                .toEqual({ tyres: spec.tyres, brakes: spec.brakes, gearbox: spec.gearbox });
            expect(ps.lapsCompleted).toBe(0);
            expect(ps.cornerStops).toBe(0);
            expect(ps.skipNextTurn).toBe(false);
            expect(ps.finishedPosition).toBeNull();
            // The turn in progress, per player and never global (§23.4).
            expect(ps.phase).toBe("shift");
            expect(ps.roll).toBeNull();
            expect(ps.brakeSpent).toBe(0);
        }
    });

    it("opens round one on the grid order, with a clean track", () => {
        const state = buildInitialRaceCarsState(TURN_ORDER, SPRINT);

        expect(state.round).toBe(1);
        expect(state.roundOrder).toEqual(TURN_ORDER);
        expect(state.roundIndex).toBe(0);
        expect(state.slicks).toEqual([]);
        expect(state.trackId).toBe(DEFAULT_TRACK_ID);
    });

    it.each(RACE_DISTANCES)("runs $name over $laps lap(s) (§15)", ({ id, laps }) => {
        expect(buildInitialRaceCarsState(TURN_ORDER, { ...SPRINT, distance: id }).laps).toBe(laps);
    });

    it.each(SPECS)("deals $name's $tyres/$brakes/$gearbox pools to the whole field (§11)", spec => {
        const state = buildInitialRaceCarsState(TURN_ORDER, { ...SPRINT, spec: spec.id });

        expect(state.spec).toBe(spec.id);
        for (const ps of mongoMap(state.players).values()) {
            expect(ps.tyres).toBe(spec.tyres);
            expect(ps.brakes).toBe(spec.brakes);
            expect(ps.gearbox).toBe(spec.gearbox);
        }
    });

    it("carries the oil-spills module through as the host set it (§14)", () => {
        expect(buildInitialRaceCarsState(TURN_ORDER, { ...SPRINT, oilSpills: true }).oilSpills).toBe(true);
        expect(buildInitialRaceCarsState(TURN_ORDER, SPRINT).oilSpills).toBe(false);
    });

    it("normalises settings that were never validated rather than storing them", () => {
        // POST /api/lobby spreads a host's per-game settings into the
        // invitation unchecked, so anything at all can reach here — and a spec
        // of `undefined` deals wear pools of `undefined`, which makes every
        // overshoot unpayable and spins the entire field (§23.4).
        const state = buildInitialRaceCarsState(TURN_ORDER, { distance: "laps: 99", spec: "unobtanium", oilSpills: "false" });

        expect(state.spec).toBe(DEFAULT_SPEC);
        expect(state.laps).toBe(distanceDef(DEFAULT_DISTANCE).laps);
        expect(state.oilSpills).toBe(false);
        for (const ps of mongoMap(state.players).values()) {
            expect(ps.tyres).toBe(specDef(DEFAULT_SPEC).tyres);
        }
    });

    it("seats a full grid of six, and refuses a seventh driver rather than parking it nowhere", () => {
        const six = Array.from({ length: MAX_PLAYERS }, (_, i) => `u${i + 1}`);
        expect(mongoMap(buildInitialRaceCarsState(six, SPRINT).players).size).toBe(MAX_PLAYERS);

        // Unreachable through either creation path — both bound the party — so
        // a seventh car is a programming error, and better thrown here than
        // discovered as `grid[6] === undefined` at an undefined row.
        expect(() => buildInitialRaceCarsState([...six, "u7"], SPRINT)).toThrow(/grid slots/);
    });
});

describe("readRaceSettings — the check both creation paths reach (§23.4)", () => {
    it("accepts a race the rules can run, and reports nothing to refuse", () => {
        expect(readRaceSettings({ distance: "grandPrix", spec: "sticky", oilSpills: true })).toEqual({
            settings: { distance: "grandPrix", spec: "sticky", oilSpills: true },
            rejection: null,
        });
    });

    it.each([
        ["distance", { ...SPRINT, distance: "marathon" }, "Unknown race distance"],
        ["spec", { ...SPRINT, spec: "unobtanium" }, "Unknown car spec"],
        ["oil spills", { ...SPRINT, oilSpills: "false" }, "Oil spills must be on or off"],
    ])("names the %s the route should answer 400 for, while still returning a runnable race", (_field, raw, rejection) => {
        const read = readRaceSettings(raw);
        expect(read.rejection).toBe(rejection);
        expect(read.settings).toEqual({ distance: DEFAULT_DISTANCE, spec: DEFAULT_SPEC, oilSpills: false });
    });

    it("refuses `\"false\"` rather than coercing it — a truthy string is not a setting", () => {
        // `!!"false"` is true, which would switch the module *on* for a field
        // that was trying to switch it off.
        expect(readRaceSettings({ ...SPRINT, oilSpills: "false" }).settings.oilSpills).toBe(false);
    });
});

describe("cloneRaceCarsState — the snapshot replay reads", () => {
    it("copies every field into independent objects, in turn order", () => {
        const state = buildInitialRaceCarsState(TURN_ORDER, { distance: "grandPrix", spec: "sticky", oilSpills: true });
        const clone = cloneRaceCarsState(state, TURN_ORDER);

        expect(clone).toEqual(state);
        expect([...mongoMap(clone.players).keys()]).toEqual(TURN_ORDER);

        // Independent: the race moving on must not reach back into the grid
        // recap replays from.
        mongoMap(state.players).get("u1")!.row = 40;
        state.slicks.push({ row: 12, lane: 2, laidOnRound: 3 });
        state.roundOrder.reverse();
        expect(mongoMap(clone.players).get("u1")!.row).toBe(TRACK.grid[0].row);
        expect(clone.slicks).toEqual([]);
        expect(clone.roundOrder).toEqual(TURN_ORDER);
    });

    it("names every field rather than spreading, so a Mongoose subdocument really is copied", () => {
        const state = buildInitialRaceCarsState(TURN_ORDER, SPRINT);
        // A subdocument keeps its fields behind getters (mongoMaps.ts), which
        // a spread copies none of — the bug that showed Train Time's reviewed
        // turns as NaN. Stand one in and check the clone came out whole.
        const real = mongoMap(state.players).get("u1")!;
        const behindGetters = {} as IRaceCarsPlayerState;
        for (const [field, value] of Object.entries(real)) {
            Object.defineProperty(behindGetters, field, { get: () => value, enumerable: false });
        }
        expect({ ...behindGetters }).toEqual({});

        const clone = cloneRaceCarsState({ ...state, players: { u1: behindGetters } }, ["u1"]);
        expect(mongoMap(clone.players).get("u1")).toEqual(real);
    });
});

// §23.4's three redaction guards are deliberately *not* here: the claim is
// the absence of hidden state, and the key-set assertion and the three-viewer
// identity assertion that prove it live with every other game's wire guard, in
// utils/apiModels/games/hiddenHands.test.ts. What is left below is behaviour
// rather than redaction.
describe("gameStateToModel — what reaches the client (§23.4)", () => {
    it("names each player and copies the track state rather than sharing it", () => {
        const state = buildInitialRaceCarsState(["u1", "u2"], SPRINT);
        state.slicks.push({ row: 12, lane: 2, laidOnRound: 1 });
        const wire = gameStateToModel(state, NAMES, "u1");

        expect(wire.playerStates.u1.username).toBe("Alice");
        expect(wire.playerStates.u2.username).toBe("Bob");
        expect(wire.roundOrder).toEqual(["u1", "u2"]);

        state.slicks[0].lane = 1;
        state.roundOrder.reverse();
        expect(wire.slicks[0].lane).toBe(2);
        expect(wire.roundOrder).toEqual(["u1", "u2"]);
    });

    it("falls back to the userId when a name is missing rather than sending nothing", () => {
        const state = buildInitialRaceCarsState(["u1", "u2"], SPRINT);
        expect(gameStateToModel(state, {}, "u1").playerStates.u1.username).toBe("u1");
    });
});
