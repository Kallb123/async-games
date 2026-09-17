import { describe, expect, it } from "vitest";
import { raceCarsRecapAdapter } from "./recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { IRaceCarsSpecificGameStateResponse, IRaceCarsPlayerStateResponse } from "./apiModels";
import type { IRaceCarsArrivalOutcome } from "./RaceCarsLogic";

// docs/games/race-cars.md §23.5: the away-time story is corner stops,
// overshoots, spins, tows, oil laid/hit, finishes and lead changes — no row
// for a plain move down a straight. These tests hand the adapter a snapshot
// pair and a command/outcome directly (the DiceCities/WorldDomination style);
// replay.test.ts covers the same adapter against a real, replayed race.

function player(
    overrides: Partial<IRaceCarsPlayerStateResponse> & { userId: string; username: string; raceNumber: number },
): IRaceCarsPlayerStateResponse {
    return {
        row: 0,
        lane: 1,
        lapsCompleted: 0,
        gear: 3,
        tyres: 5,
        brakes: 4,
        gearbox: 3,
        cornerStops: 0,
        skipNextTurn: false,
        finishedPosition: null,
        phase: 'move',
        roll: null,
        brakeSpent: 0,
        startRoll: null,
        ...overrides,
    };
}

function state(
    overrides: Partial<IRaceCarsSpecificGameStateResponse> & { playerStates: Record<string, IRaceCarsPlayerStateResponse> },
): IRaceCarsSpecificGameStateResponse {
    return {
        trackId: 'ashcombe',
        laps: 1,
        spec: 'balanced',
        oilSpills: false,
        round: 1,
        roundOrder: Object.keys(overrides.playerStates),
        roundIndex: 0,
        slicks: [],
        ...overrides,
    };
}

function snap(gs: IRaceCarsSpecificGameStateResponse): ITurnSnapshot {
    return { index: 0, specificGameState: gs, currentTurn: "", complete: false, winner: "", history: [], command: null, planned: false };
}

function cmd(overrides: Partial<IGameCommand> & { className: string }): IGameCommand {
    return {
        id: "c1",
        timestamp: "2026-07-21T09:00:00.000Z",
        senderId: "u1",
        senderUsername: "Alice",
        ...overrides,
    } as unknown as IGameCommand;
}

function arrivalOutcome(overrides: Partial<IRaceCarsArrivalOutcome['arrival']> = {}): ICommandOutcome {
    return {
        validMove: true,
        turnOver: true,
        arrival: {
            events: [],
            row: 20,
            lane: 1,
            roll: { gear: 3, value: 6 },
            spun: false,
            finished: false,
            tyresSpent: 0,
            towOffered: false,
            ...overrides,
        },
    } as unknown as ICommandOutcome;
}

const alice = (overrides: Partial<IRaceCarsPlayerStateResponse> = {}) =>
    player({ userId: "u1", username: "Alice", raceNumber: 1, ...overrides });
const bob = (overrides: Partial<IRaceCarsPlayerStateResponse> = {}) =>
    player({ userId: "u2", username: "Bob", raceNumber: 2, ...overrides });

describe("Race Cars recap adapter", () => {
    it("skips RaceCarsShift entirely — the roll is only a story once spent", () => {
        const events = raceCarsRecapAdapter.toEvents(
            snap(state({ playerStates: { u1: alice() } })),
            snap(state({ playerStates: { u1: alice() } })),
            cmd({ className: "RaceCarsShift" }),
            { validMove: true, turnOver: false } as ICommandOutcome,
        );
        expect(events).toEqual([]);
    });

    it("reports a getaway only when it was not the ordinary one (§6a)", () => {
        const launched = (start: { roll: number; outcome: string; spaces: number }) =>
            raceCarsRecapAdapter.toEvents(
                snap(state({ playerStates: { u1: alice() } })),
                snap(state({ playerStates: { u1: alice() } })),
                cmd({ className: "RaceCarsLaunch" }),
                { validMove: true, turnOver: start.outcome === 'stalled', start } as unknown as ICommandOutcome,
            );

        const stalled = launched({ roll: 1, outcome: 'stalled', spaces: 0 });
        expect(stalled).toHaveLength(1);
        expect(stalled[0].type).toBe("rc_stall");
        expect(stalled[0].title).toContain("Alice bogged down off the line");

        const flying = launched({ roll: 18, outcome: 'flying', spaces: 4 });
        expect(flying).toHaveLength(1);
        expect(flying[0].type).toBe("rc_flier");
        expect(flying[0].title).toContain("flying start");

        // A clean getaway is the grid doing what the grid does.
        expect(launched({ roll: 9, outcome: 'away', spaces: 2 })).toEqual([]);
    });

    it("banks a corner stop using narration's own wording", () => {
        const events = raceCarsRecapAdapter.toEvents(
            snap(state({ playerStates: { u1: alice() } })),
            snap(state({ playerStates: { u1: alice({ row: 12 }) } })),
            cmd({ className: "RaceCarsMove" }),
            arrivalOutcome({ events: [{ type: 'cornerStop', cornerId: 'hairpin', banked: 1, owed: 2 }], row: 12 }),
        );
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("rc_cornerstop");
        expect(events[0].title).toBe("Alice banked a stop in Ashcombe Hairpin (1 of 2)");
    });

    it("names an overshoot by rows", () => {
        const events = raceCarsRecapAdapter.toEvents(
            snap(state({ playerStates: { u1: alice() } })),
            snap(state({ playerStates: { u1: alice({ row: 55, tyres: 1 }) } })),
            cmd({ className: "RaceCarsMove" }),
            arrivalOutcome({ events: [{ type: 'overshoot', cornerId: 'gravel', spaces: 4, waived: false }], row: 55, tyresSpent: 4 }),
        );
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("rc_overshoot");
        expect(events[0].title).toBe("Alice overshot Gravel Bend by 4 spaces");
    });

    it("distinguishes an overshoot spin from an oil spin, the same row-list entry either way", () => {
        const overshootSpin = raceCarsRecapAdapter.toEvents(
            snap(state({ playerStates: { u1: alice() } })),
            snap(state({ playerStates: { u1: alice({ row: 51, gear: 0, skipNextTurn: true }) } })),
            cmd({ className: "RaceCarsMove" }),
            arrivalOutcome({ events: [{ type: 'spin', cause: 'overshoot', cornerId: 'gravel' }], row: 51, spun: true }),
        );
        expect(overshootSpin).toHaveLength(1);
        expect(overshootSpin[0].type).toBe("rc_spin");
        expect(overshootSpin[0].title).toBe("Alice spun back into Gravel Bend and misses their next turn");

        const oilSpin = raceCarsRecapAdapter.toEvents(
            snap(state({ playerStates: { u1: alice() } })),
            snap(state({ playerStates: { u1: alice({ row: 30, gear: 0, skipNextTurn: true }) } })),
            cmd({ className: "RaceCarsMove" }),
            arrivalOutcome({ events: [{ type: 'spin', cause: 'oil', cornerId: null }], row: 30, spun: true }),
        );
        // An oil spin names no corner: the car stops on the slick, wherever it lies.
        expect(oilSpin[0].title).toBe("Alice hit a slick and spun and misses their next turn");
    });

    it("gives a taken tow its own row, and stays silent on a declined one", () => {
        const took = raceCarsRecapAdapter.toEvents(
            snap(state({ playerStates: { u1: alice() } })),
            snap(state({ playerStates: { u1: alice({ row: 23 }) } })),
            cmd({ className: "RaceCarsSlipstream", tow: { row: 23, lane: 1 } } as Partial<IGameCommand> & { className: string }),
            arrivalOutcome({ row: 23 }),
        );
        expect(took.map(e => e.type)).toContain("rc_tow");

        const declined = raceCarsRecapAdapter.toEvents(
            snap(state({ playerStates: { u1: alice() } })),
            snap(state({ playerStates: { u1: alice() } })),
            cmd({ className: "RaceCarsSlipstream", tow: null } as Partial<IGameCommand> & { className: string }),
            { validMove: true, turnOver: true } as ICommandOutcome,
        );
        expect(declined).toEqual([]);
    });

    it("reports a slick actually laid, but not one merely refreshed in place", () => {
        const prevState = state({
            oilSpills: true,
            playerStates: { u1: alice() },
            slicks: [{ row: 10, lane: 1, laidOnRound: 1 }],
        });
        const nextState = state({
            oilSpills: true,
            playerStates: { u1: alice({ row: 40 }) },
            slicks: [{ row: 10, lane: 1, laidOnRound: 2 }, { row: 40, lane: 2, laidOnRound: 2 }],
        });
        const events = raceCarsRecapAdapter.toEvents(
            snap(prevState),
            snap(nextState),
            cmd({ className: "RaceCarsMove" }),
            arrivalOutcome({ row: 40 }),
        );
        expect(events.filter(e => e.type === "rc_oillaid")).toHaveLength(1);
    });

    it("calls a new leader out only on the command that actually changes the round order", () => {
        const events = raceCarsRecapAdapter.toEvents(
            snap(state({ roundOrder: ["u1", "u2"], playerStates: { u1: alice(), u2: bob() } })),
            snap(state({ roundOrder: ["u2", "u1"], playerStates: { u1: alice(), u2: bob() } })),
            cmd({ className: "RaceCarsMove" }),
            arrivalOutcome({}),
        );
        expect(events.some(e => e.type === "rc_lead" && e.title === "Bob takes the lead")).toBe(true);
    });

    it("takes the chequered flag as its own row", () => {
        const events = raceCarsRecapAdapter.toEvents(
            snap(state({ playerStates: { u1: alice() } })),
            snap(state({ playerStates: { u1: alice({ finishedPosition: 1 }) } })),
            cmd({ className: "RaceCarsMove" }),
            arrivalOutcome({ events: [{ type: 'finish' }], finished: true }),
        );
        expect(events.some(e => e.type === "rc_finish" && e.title === "Alice takes the chequered flag!")).toBe(true);
    });

    it("says nothing for a plain move down a straight", () => {
        const events = raceCarsRecapAdapter.toEvents(
            snap(state({ playerStates: { u1: alice() } })),
            snap(state({ playerStates: { u1: alice({ row: 20 }) } })),
            cmd({ className: "RaceCarsMove" }),
            arrivalOutcome({ row: 20 }),
        );
        expect(events).toEqual([]);
    });
});

describe("Race Cars recap summary and tip", () => {
    it("headlines a spin over a plain corner stop", () => {
        const summary = raceCarsRecapAdapter.summarize(
            [
                { id: "1", commandId: "1", timestamp: "", actorId: "u2", actorUsername: "Bob", type: "rc_cornerstop", title: "" },
                { id: "2", commandId: "2", timestamp: "", actorId: "u2", actorUsername: "Bob", type: "rc_spin", title: "" },
            ],
            "u1",
        );
        expect(summary.subline).toContain("somebody spun");
    });

    it("tips the standings, with the corner still owed", () => {
        const gs = state({
            roundOrder: ["u2", "u1"],
            playerStates: {
                u1: alice({ row: 12, cornerStops: 1 }),
                u2: bob({ row: 20 }),
            },
        });
        const tip = raceCarsRecapAdapter.tip!(gs, "u1");
        expect(tip?.text).toBe("You're P2, 8 rows off the lead, and Ashcombe Hairpin still owes you 1 stop.");
    });

    it("has nothing left to add for the leader, clear of every corner", () => {
        const gs = state({
            roundOrder: ["u1", "u2"],
            playerStates: {
                u1: alice({ row: 20 }),
                u2: bob({ row: 10 }),
            },
        });
        const tip = raceCarsRecapAdapter.tip!(gs, "u1");
        expect(tip?.text).toBe("You're leading.");
    });
});
