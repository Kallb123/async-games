import { describe, expect, it } from "vitest";
import { ADJACENCY, CITIES } from "./board";
import {
    canDiscoverCure,
    cureCardsRequired,
    emptyBoardCubes,
    getLegalMoves,
    infectionRateFor,
    isCubeExhaustionLoss,
    isOutbreakCascadeLoss,
    isPlayerDeckEmptyLoss,
    placeCubeOrOutbreak,
    stationCityIds,
    CUBES_PER_CITY_LIMIT,
    INFECTION_RATE_TRACK,
    OUTBREAK_LOSS_THRESHOLD,
} from "./rules";

function idFor(name: string): number {
    const city = CITIES.find(c => c.name === name);
    if (!city) throw new Error(`unknown city: ${name}`);
    return city.id;
}

describe("getLegalMoves", () => {
    const currentCity = idFor("Atlanta"); // adjacent to Chicago, Washington, Miami

    it("includes every adjacent city as a drive/ferry move", () => {
        const moves = getLegalMoves({ currentCity, hand: [], researchStations: [] });
        const driveDestinations = moves.filter(m => m.type === "drive").map(m => m.destination);
        expect(driveDestinations.sort((a, b) => a - b)).toEqual([...ADJACENCY[currentCity]].sort((a, b) => a - b));
    });

    it("offers a direct flight to each non-current city held in hand", () => {
        const tokyo = idFor("Tokyo");
        const moves = getLegalMoves({ currentCity, hand: [tokyo, currentCity], researchStations: [] });
        const directFlights = moves.filter(m => m.type === "directFlight");
        expect(directFlights).toHaveLength(1);
        expect(directFlights[0]).toMatchObject({ destination: tokyo, discardCityId: tokyo });
    });

    it("offers a charter flight to any city only when the current city's own card is held", () => {
        const withoutOwnCard = getLegalMoves({ currentCity, hand: [idFor("Tokyo")], researchStations: [] });
        expect(withoutOwnCard.some(m => m.type === "charterFlight")).toBe(false);

        const withOwnCard = getLegalMoves({ currentCity, hand: [currentCity], researchStations: [] });
        const charterFlights = withOwnCard.filter(m => m.type === "charterFlight");
        expect(charterFlights).toHaveLength(CITIES.length - 1);
    });

    it("offers a shuttle flight only between cities with research stations", () => {
        const stationA = currentCity;
        const stationB = idFor("Sydney");
        const notAStation = idFor("Tokyo");

        const noStation = getLegalMoves({ currentCity, hand: [], researchStations: [stationB] });
        expect(noStation.some(m => m.type === "shuttleFlight")).toBe(false);

        const withStations = getLegalMoves({ currentCity, hand: [], researchStations: [stationA, stationB, notAStation] });
        const shuttleDestinations = withStations.filter(m => m.type === "shuttleFlight").map(m => m.destination);
        expect(shuttleDestinations.sort((a, b) => a - b)).toEqual([notAStation, stationB].sort((a, b) => a - b));
    });
});

describe("cure eligibility", () => {
    it("requires 5 cards of the colour at a research station, or 4 for the Scientist", () => {
        expect(cureCardsRequired()).toBe(5);
        expect(cureCardsRequired(true)).toBe(4);

        expect(canDiscoverCure({ atResearchStation: true, handColorCount: 5 })).toBe(true);
        expect(canDiscoverCure({ atResearchStation: true, handColorCount: 4 })).toBe(false);
        expect(canDiscoverCure({ atResearchStation: true, handColorCount: 4, isScientist: true })).toBe(true);
        expect(canDiscoverCure({ atResearchStation: false, handColorCount: 5 })).toBe(false);
    });
});

describe("loss checks (§4.2)", () => {
    it("triggers an outbreak cascade loss once the marker reaches the threshold", () => {
        expect(isOutbreakCascadeLoss(OUTBREAK_LOSS_THRESHOLD - 1)).toBe(false);
        expect(isOutbreakCascadeLoss(OUTBREAK_LOSS_THRESHOLD)).toBe(true);
    });

    it("triggers a cube exhaustion loss when supply can't cover what must be placed", () => {
        expect(isCubeExhaustionLoss(2, 3)).toBe(true);
        expect(isCubeExhaustionLoss(3, 3)).toBe(false);
    });

    it("triggers a time-out loss when the player deck is empty", () => {
        expect(isPlayerDeckEmptyLoss(0)).toBe(true);
        expect(isPlayerDeckEmptyLoss(1)).toBe(false);
    });
});

describe("placeCubeOrOutbreak", () => {
    it("places a single cube when the city is below the limit", () => {
        const cubes = emptyBoardCubes();
        const result = placeCubeOrOutbreak(cubes, idFor("Atlanta"), "blue");
        expect(result.outbreaks).toBe(0);
        expect(result.cubes[idFor("Atlanta")].blue).toBe(1);
        // Pure: the input board is untouched.
        expect(cubes[idFor("Atlanta")].blue).toBe(0);
    });

    // Hand-built cluster reproducing §10.1's chain reaction and the "once
    // per infection card resolution" rule: Istanbul and Cairo (adjacent to
    // each other) both start saturated at 3 black cubes. Infecting Istanbul
    // outbreaks it, which spreads a cube to Cairo — pushing Cairo to its own
    // outbreak, which spreads back to Istanbul. Istanbul must not outbreak
    // (or accumulate a cube) a second time, while Algiers and Baghdad — each
    // adjacent to both outbreaking cities — should receive one cube per
    // outbreak that reaches them.
    it("chains through a saturated cluster without re-outbreaking a city (§10.1)", () => {
        const istanbul = idFor("Istanbul");
        const cairo = idFor("Cairo");
        const milan = idFor("Milan");
        const stPetersburg = idFor("St. Petersburg");
        const moscow = idFor("Moscow");
        const baghdad = idFor("Baghdad");
        const algiers = idFor("Algiers");
        const riyadh = idFor("Riyadh");
        const khartoum = idFor("Khartoum");

        const cubes = emptyBoardCubes();
        cubes[istanbul].black = CUBES_PER_CITY_LIMIT;
        cubes[cairo].black = CUBES_PER_CITY_LIMIT;

        const result = placeCubeOrOutbreak(cubes, istanbul, "black");

        expect(result.outbreaks).toBe(2);
        expect(result.outbrokenCities).toEqual([istanbul, cairo]);

        // Outbreaking cities stay capped at the limit — no cube is added there.
        expect(result.cubes[istanbul].black).toBe(CUBES_PER_CITY_LIMIT);
        expect(result.cubes[cairo].black).toBe(CUBES_PER_CITY_LIMIT);

        // Shared neighbours of both outbreaking cities get one cube per outbreak.
        expect(result.cubes[algiers].black).toBe(2);
        expect(result.cubes[baghdad].black).toBe(2);

        // Neighbours of only one outbreaking city get exactly one cube.
        expect(result.cubes[milan].black).toBe(1);
        expect(result.cubes[stPetersburg].black).toBe(1);
        expect(result.cubes[moscow].black).toBe(1);
        expect(result.cubes[riyadh].black).toBe(1);
        expect(result.cubes[khartoum].black).toBe(1);
    });

    it("does not re-trigger or re-add a cube to a city already outbroken this resolution", () => {
        const alreadyOutbroken = new Set<number>([idFor("Istanbul")]);
        const cubes = emptyBoardCubes();
        cubes[idFor("Istanbul")].black = CUBES_PER_CITY_LIMIT;

        const result = placeCubeOrOutbreak(cubes, idFor("Istanbul"), "black", alreadyOutbroken);

        expect(result.outbreaks).toBe(0);
        expect(result.outbrokenCities).toEqual([]);
        expect(result.cubes[idFor("Istanbul")].black).toBe(CUBES_PER_CITY_LIMIT);
    });
});

describe("stationCityIds", () => {
    it("returns the ids of every city flagged as a station, in id order", () => {
        const cities = [{ station: false }, { station: true }, { station: false }, { station: true }];
        expect(stationCityIds(cities)).toEqual([1, 3]);
    });

    it("returns an empty array when no city has a station", () => {
        expect(stationCityIds([{ station: false }, { station: false }])).toEqual([]);
    });
});

describe("infectionRateFor (§9.1)", () => {
    it("reads the escalating track by index", () => {
        expect(INFECTION_RATE_TRACK).toEqual([2, 2, 2, 3, 3, 4, 4]);
        INFECTION_RATE_TRACK.forEach((rate, index) => {
            expect(infectionRateFor(index)).toBe(rate);
        });
    });

    it("clamps to the final rate past the end of the track", () => {
        expect(infectionRateFor(INFECTION_RATE_TRACK.length)).toBe(4);
        expect(infectionRateFor(99)).toBe(4);
    });
});
