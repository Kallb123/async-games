import { describe, expect, it } from "vitest";
import { outbreakRecapAdapter } from "./recap";
import { CITIES, CITY_COUNT } from "./board";
import type { IOutbreakInfectionPhaseOutcome } from "./OutbreakLogic";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand } from "@/utils/apiModels/GameLogic";
import type { IOutbreakSpecificGameStateResponse } from "./apiModels";

function idFor(name: string): number {
    const city = CITIES.find(c => c.name === name);
    if (!city) throw new Error(`unknown city: ${name}`);
    return city.id;
}

function state(): IOutbreakSpecificGameStateResponse {
    return {
        difficulty: 'standard',
        cities: Array.from({ length: CITY_COUNT }, () => ({ cubes: { blue: 0, yellow: 0, black: 0, red: 0 }, station: false })),
        cubesLeft: { blue: 24, yellow: 24, black: 24, red: 24 },
        cures: { blue: 'none', yellow: 'none', black: 'none', red: 'none' },
        outbreaks: 0,
        infectionRateIndex: 0,
        playerDeckCount: 0,
        playerDiscard: [],
        infectionDeckCount: 0,
        infectionDiscard: [],
        playerStates: {},
        phase: 'actions',
        oneQuietNightActive: false,
        forecastCards: [],
    };
}

function snap(gs: IOutbreakSpecificGameStateResponse): ITurnSnapshot {
    return { index: 0, specificGameState: gs, currentTurn: "", complete: false, winner: "", history: [], command: null, planned: false };
}

function cmd(overrides: Partial<IGameCommand> & { className: string }): IGameCommand {
    return {
        id: "c1",
        timestamp: "2026-08-28T09:00:00.000Z",
        senderId: "u1",
        senderUsername: "Alice",
        ...overrides,
    } as unknown as IGameCommand;
}

describe("Outbreak recap adapter — Quarantine Specialist containment", () => {
    it("reports a contained draw even though it moved no cube and triggered no outbreak", () => {
        const chicago = idFor("Chicago");
        const outcome: IOutbreakInfectionPhaseOutcome = {
            validMove: true,
            turnOver: true,
            infectionLog: [{ kind: 'infect', cityId: chicago, color: 'blue', outcome: 'contained' }],
        };

        const events = outbreakRecapAdapter.toEvents(snap(state()), snap(state()), cmd({ className: "OutbreakEndTurn" }), outcome);

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("ob_contained");
        expect(events[0].title).toContain("Quarantine Specialist");
        expect(events[0].detail).toBe("Chicago");
    });

    it("names every contained city when more than one card was blocked", () => {
        const [chicago, tokyo] = [idFor("Chicago"), idFor("Tokyo")];
        const outcome: IOutbreakInfectionPhaseOutcome = {
            validMove: true,
            turnOver: true,
            infectionLog: [
                { kind: 'infect', cityId: chicago, color: 'blue', outcome: 'contained' },
                { kind: 'infect', cityId: tokyo, color: 'red', outcome: 'placed' },
                { kind: 'infect', cityId: tokyo, color: 'red', outcome: 'contained' },
            ],
        };

        const events = outbreakRecapAdapter.toEvents(snap(state()), snap(state()), cmd({ className: "OutbreakEndTurn" }), outcome);

        const contained = events.find(e => e.type === "ob_contained");
        expect(contained?.title).toBe("The Quarantine Specialist blocked 2 infections");
        expect(contained?.detail).toBe("Chicago, Tokyo");
    });

    it("stays silent when nothing was contained", () => {
        const outcome: IOutbreakInfectionPhaseOutcome = {
            validMove: true,
            turnOver: true,
            infectionLog: [{ kind: 'infect', cityId: idFor("Chicago"), color: 'blue', outcome: 'placed' }],
        };

        const events = outbreakRecapAdapter.toEvents(snap(state()), snap(state()), cmd({ className: "OutbreakEndTurn" }), outcome);

        expect(events.some(e => e.type === "ob_contained")).toBe(false);
    });

    it("also checks OutbreakDiscard and OutbreakPlayEvent, not just OutbreakEndTurn", () => {
        const outcome: IOutbreakInfectionPhaseOutcome = {
            validMove: true,
            turnOver: true,
            infectionLog: [{ kind: 'infect', cityId: idFor("Chicago"), color: 'blue', outcome: 'contained' }],
        };

        for (const className of ["OutbreakDiscard", "OutbreakPlayEvent"]) {
            const events = outbreakRecapAdapter.toEvents(snap(state()), snap(state()), cmd({ className }), outcome);
            expect(events.some(e => e.type === "ob_contained")).toBe(true);
        }
    });

    it("names the cities an outbreak overflowed onto", () => {
        const lagos = idFor("Lagos");
        const [khartoum, kinshasa, saoPaulo] = [idFor("Khartoum"), idFor("Kinshasa"), idFor("Sao Paulo")];
        const prev = state();
        const next = { ...state(), outbreaks: 1 };
        const outcome: IOutbreakInfectionPhaseOutcome = {
            validMove: true,
            turnOver: true,
            infectionLog: [{
                kind: 'infect', cityId: lagos, color: 'yellow', outcome: 'outbreak',
                outbreakChain: [{ city: lagos, infected: [khartoum, kinshasa, saoPaulo] }],
            }],
        };

        const events = outbreakRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "OutbreakEndTurn" }), outcome);

        const outbreak = events.find(e => e.type === "ob_outbreak");
        expect(outbreak?.title).toBe("1 outbreak — the marker is now 1/8");
        expect(outbreak?.detail).toBe("Lagos overflowed onto Khartoum, Kinshasa and Sao Paulo");
    });

    it("walks a cascade of outbreaks city by city, showing how each infected its neighbours", () => {
        const [istanbul, cairo] = [idFor("Istanbul"), idFor("Cairo")];
        const [milan, baghdad, algiers, khartoum] = [idFor("Milan"), idFor("Baghdad"), idFor("Algiers"), idFor("Khartoum")];
        const prev = state();
        const next = { ...state(), outbreaks: 2 };
        const outcome: IOutbreakInfectionPhaseOutcome = {
            validMove: true,
            turnOver: true,
            infectionLog: [{
                kind: 'infect', cityId: istanbul, color: 'black', outcome: 'outbreak',
                outbreakChain: [
                    { city: istanbul, infected: [milan, baghdad, algiers] },
                    { city: cairo, infected: [algiers, baghdad, khartoum] },
                ],
            }],
        };

        const events = outbreakRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "OutbreakEndTurn" }), outcome);

        const outbreak = events.find(e => e.type === "ob_outbreak");
        expect(outbreak?.title).toBe("2 outbreaks — the marker is now 2/8");
        expect(outbreak?.detail).toBe(
            "Istanbul cascaded: Istanbul → Milan, Baghdad and Algiers; Cairo → Algiers, Baghdad and Khartoum",
        );
    });

    it("names each outbreak when more than one card outbroke in the same phase", () => {
        const [lagos, miami, bogota] = [idFor("Lagos"), idFor("Miami"), idFor("Bogota")];
        const kinshasa = idFor("Kinshasa");
        const prev = state();
        const next = { ...state(), outbreaks: 2 };
        const outcome: IOutbreakInfectionPhaseOutcome = {
            validMove: true,
            turnOver: true,
            infectionLog: [
                { kind: 'infect', cityId: lagos, color: 'yellow', outcome: 'outbreak', outbreakChain: [{ city: lagos, infected: [kinshasa] }] },
                { kind: 'infect', cityId: miami, color: 'yellow', outcome: 'outbreak', outbreakChain: [{ city: miami, infected: [bogota] }] },
            ],
        };

        const events = outbreakRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "OutbreakEndTurn" }), outcome);

        const outbreak = events.find(e => e.type === "ob_outbreak");
        expect(outbreak?.detail).toBe("Lagos overflowed onto Kinshasa · Miami overflowed onto Bogota");
    });

    it("names the infected cities on an ordinary infect phase instead of just a cube count", () => {
        const [chicago, paris] = [idFor("Chicago"), idFor("Paris")];
        const prev = state();
        const nextCities = state().cities.map(c => ({ ...c, cubes: { ...c.cubes } }));
        nextCities[chicago].cubes.blue = 2;
        nextCities[paris].cubes.blue = 1;
        const next = { ...state(), cities: nextCities };
        const outcome: IOutbreakInfectionPhaseOutcome = {
            validMove: true,
            turnOver: true,
            infectionLog: [
                { kind: 'infect', cityId: chicago, color: 'blue', outcome: 'placed' },
                { kind: 'infect', cityId: chicago, color: 'blue', outcome: 'placed' },
                { kind: 'infect', cityId: paris, color: 'blue', outcome: 'placed' },
            ],
        };

        const events = outbreakRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "OutbreakEndTurn" }), outcome);

        const infect = events.find(e => e.type === "ob_infect");
        expect(infect?.title).toBe("The board got worse — 3 new cubes placed");
        expect(infect?.detail).toBe("Chicago (×2), Paris");
    });

    it("narrates the infect phase even when a hand-limit discard is the command that finishes it", () => {
        const lagos = idFor("Lagos");
        const kinshasa = idFor("Kinshasa");
        const prev = state();
        const next = { ...state(), outbreaks: 1 };
        const outcome: IOutbreakInfectionPhaseOutcome = {
            validMove: true,
            turnOver: true,
            infectionLog: [{
                kind: 'infect', cityId: lagos, color: 'yellow', outcome: 'outbreak',
                outbreakChain: [{ city: lagos, infected: [kinshasa] }],
            }],
        };

        const events = outbreakRecapAdapter.toEvents(snap(prev), snap(next), cmd({ className: "OutbreakDiscard" }), outcome);

        expect(events.some(e => e.type === "ob_outbreak")).toBe(true);
    });

    it("summarizes a contained-only turn distinctly from a silent one", () => {
        const containedEvent = outbreakRecapAdapter.toEvents(
            snap(state()),
            snap(state()),
            cmd({ className: "OutbreakEndTurn" }),
            { validMove: true, turnOver: true, infectionLog: [{ kind: 'infect', cityId: idFor("Chicago"), color: 'blue', outcome: 'contained' }] } as IOutbreakInfectionPhaseOutcome,
        );

        const summary = outbreakRecapAdapter.summarize(containedEvent, "u2");
        expect(summary.subline).toContain("Quarantine Specialist held the line");
    });
});
