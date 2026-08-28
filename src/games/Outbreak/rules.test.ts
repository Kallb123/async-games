import { describe, expect, it } from "vitest";
import { ADJACENCY, CITIES, EPIDEMIC_CARD_ID, EVENT_CARD_FORECAST, ROLES } from "./board";
import {
    buildEpidemicDeck,
    canDiscoverCure,
    cureCardsRequired,
    dealRoles,
    dispatcherCanControlOthers,
    emptyBoardCubes,
    getLegalMoves,
    infectionRateFor,
    isCubeExhaustionLoss,
    isOutbreakCascadeLoss,
    isPlayerDeckEmptyLoss,
    isProtectedByQuarantine,
    medicAutoClearColors,
    opsExpertBuildsFree,
    placeCubeOrOutbreak,
    placeEpidemicCubesOrOutbreak,
    shareKnowledgeCardMatchRequired,
    stationCityIds,
    treatDiseaseRemovalCount,
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

    it("ignores event and epidemic card ids in hand — neither names a flyable destination (§21.6 step 10)", () => {
        const tokyo = idFor("Tokyo");
        const moves = getLegalMoves({ currentCity, hand: [tokyo, EVENT_CARD_FORECAST, EPIDEMIC_CARD_ID], researchStations: [] });
        const directFlights = moves.filter(m => m.type === "directFlight");
        expect(directFlights).toEqual([{ type: "directFlight", destination: tokyo, discardCityId: tokyo }]);
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

describe("placeEpidemicCubesOrOutbreak (§9.1 step 2)", () => {
    it("places all 3 cubes at once when the city is below the cap", () => {
        const cubes = emptyBoardCubes();
        cubes[idFor("Atlanta")].blue = 1;

        const result = placeEpidemicCubesOrOutbreak(cubes, idFor("Atlanta"), "blue");

        expect(result.outbreaks).toBe(0);
        expect(result.cubes[idFor("Atlanta")].blue).toBe(CUBES_PER_CITY_LIMIT);
        // Pure: the input board is untouched.
        expect(cubes[idFor("Atlanta")].blue).toBe(1);
    });

    it("adds only enough cubes to reach the cap, not a full 3, when some are already there", () => {
        const cubes = emptyBoardCubes();
        cubes[idFor("Chicago")].blue = 2;

        const result = placeEpidemicCubesOrOutbreak(cubes, idFor("Chicago"), "blue", { blue: 1, yellow: 0, black: 0, red: 0 });

        expect(result.outbreaks).toBe(0);
        expect(result.cubes[idFor("Chicago")].blue).toBe(CUBES_PER_CITY_LIMIT);
        expect(result.cubesLeft).toEqual({ blue: 0, yellow: 0, black: 0, red: 0 });
    });

    it("triggers an outbreak instead of a 4th cube when the city is already at the cap", () => {
        const cubes = emptyBoardCubes();
        cubes[idFor("Atlanta")].blue = CUBES_PER_CITY_LIMIT;

        const result = placeEpidemicCubesOrOutbreak(cubes, idFor("Atlanta"), "blue");

        expect(result.outbreaks).toBe(1);
        expect(result.outbrokenCities).toEqual([idFor("Atlanta")]);
        expect(result.cubes[idFor("Atlanta")].blue).toBe(CUBES_PER_CITY_LIMIT);
        for (const neighbor of ADJACENCY[idFor("Atlanta")]) {
            expect(result.cubes[neighbor].blue).toBe(1);
        }
    });

    it("loses immediately if the supply can't cover the cubes needed to reach the cap", () => {
        const cubes = emptyBoardCubes();
        cubes[idFor("Chicago")].blue = 0;

        const result = placeEpidemicCubesOrOutbreak(cubes, idFor("Chicago"), "blue", { blue: 2, yellow: 0, black: 0, red: 0 });

        expect(result.cubeExhausted).toBe(true);
        expect(result.cubes[idFor("Chicago")].blue).toBe(0);
    });
});

describe("buildEpidemicDeck (§6 step 7)", () => {
    it("shuffles exactly one epidemic into each of N equal-ish piles and stacks them", () => {
        const cards = Array.from({ length: 40 }, (_, i) => i);
        const deck = buildEpidemicDeck(cards, 5);

        expect(deck).toHaveLength(45);
        expect(deck.filter(c => c === EPIDEMIC_CARD_ID)).toHaveLength(5);
        // Every original card survives exactly once.
        expect(deck.filter(c => c !== EPIDEMIC_CARD_ID).sort((a, b) => a - b)).toEqual(cards);
    });

    it("distributes a remainder across piles as evenly as possible rather than dropping cards", () => {
        const cards = Array.from({ length: 44 }, (_, i) => i); // 44 / 5 doesn't divide evenly
        const deck = buildEpidemicDeck(cards, 5);

        expect(deck).toHaveLength(49);
        expect(deck.filter(c => c === EPIDEMIC_CARD_ID)).toHaveLength(5);
        expect(deck.filter(c => c !== EPIDEMIC_CARD_ID).sort((a, b) => a - b)).toEqual(cards);
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

// ─── Roles (§11, §21.6 step 9) ─────────────────────────────────────────────

describe("dealRoles", () => {
    it("deals one of the seven roles to every seat, with no repeats", () => {
        const turnOrder = ["u1", "u2", "u3", "u4"];
        const assignment = dealRoles(turnOrder);

        expect(assignment.size).toBe(turnOrder.length);
        const dealt = turnOrder.map(userId => assignment.get(userId));
        expect(dealt.every(role => role !== undefined)).toBe(true);
        expect(new Set(dealt).size).toBe(turnOrder.length); // no repeats
        expect(dealt.every(role => ROLES.some(r => r.id === role))).toBe(true);
    });

    it("deals no more roles than there are seats, out of all seven", () => {
        const assignment = dealRoles(["u1", "u2"]);
        expect(assignment.size).toBe(2);
        expect(ROLES.length).toBe(7);
    });
});

describe("treatDiseaseRemovalCount (§11 Medic)", () => {
    it("removes only 1 cube of an uncured colour for every non-Medic role", () => {
        expect(treatDiseaseRemovalCount(false, 3, null)).toBe(1);
        expect(treatDiseaseRemovalCount(false, 3, 'scientist')).toBe(1);
    });

    it("removes every cube of a cured colour regardless of role", () => {
        expect(treatDiseaseRemovalCount(true, 3, null)).toBe(3);
    });

    it("removes every cube in one action for the Medic, cured or not", () => {
        expect(treatDiseaseRemovalCount(false, 3, 'medic')).toBe(3);
        expect(treatDiseaseRemovalCount(true, 3, 'medic')).toBe(3);
    });
});

describe("medicAutoClearColors (§11, §16 Medic)", () => {
    const cures = { blue: 'cured', yellow: 'none', black: 'eradicated', red: 'none' } as const;
    const cubes = { blue: 2, yellow: 1, black: 0, red: 0 };

    it("qualifies every cured colour with cubes present, for the Medic only", () => {
        expect(medicAutoClearColors('medic', cubes, cures).sort()).toEqual(['blue']);
    });

    it("never qualifies anything for any other role", () => {
        expect(medicAutoClearColors(null, cubes, cures)).toEqual([]);
        expect(medicAutoClearColors('scientist', cubes, cures)).toEqual([]);
    });

    it("does not qualify an uncured colour even with cubes present", () => {
        expect(medicAutoClearColors('medic', { blue: 0, yellow: 3, black: 0, red: 0 }, cures)).toEqual([]);
    });
});

describe("isProtectedByQuarantine (§11, §16 Quarantine Specialist)", () => {
    it("is never protected when no one holds the role", () => {
        expect(isProtectedByQuarantine(null, idFor("Atlanta"))).toBe(false);
    });

    it("protects her own city and every adjacent city", () => {
        const atlanta = idFor("Atlanta");
        expect(isProtectedByQuarantine(atlanta, atlanta)).toBe(true);
        for (const neighbor of ADJACENCY[atlanta]) {
            expect(isProtectedByQuarantine(atlanta, neighbor)).toBe(true);
        }
    });

    it("does not protect a city that isn't hers or adjacent to it", () => {
        expect(isProtectedByQuarantine(idFor("Atlanta"), idFor("Tokyo"))).toBe(false);
    });
});

describe("placeCubeOrOutbreak / placeEpidemicCubesOrOutbreak with isProtected (§11, §16)", () => {
    it("places nothing and triggers no outbreak in a protected city", () => {
        const cubes = emptyBoardCubes();
        const atlanta = idFor("Atlanta");
        cubes[atlanta].blue = CUBES_PER_CITY_LIMIT;

        const result = placeCubeOrOutbreak(cubes, atlanta, "blue", new Set(), undefined, id => id === atlanta);

        expect(result.outbreaks).toBe(0);
        expect(result.cubes[atlanta].blue).toBe(CUBES_PER_CITY_LIMIT);
        for (const neighbor of ADJACENCY[atlanta]) {
            expect(result.cubes[neighbor].blue).toBe(0);
        }
    });

    it("stops a chain from spreading further once it reaches a protected city", () => {
        const cubes = emptyBoardCubes();
        const chicago = idFor("Chicago");
        const atlanta = idFor("Atlanta"); // adjacent to Chicago
        cubes[chicago].blue = CUBES_PER_CITY_LIMIT;

        // Atlanta is protected: the outbreak from Chicago must not place a
        // cube there, and therefore cannot cascade past it either.
        const result = placeCubeOrOutbreak(cubes, chicago, "blue", new Set(), undefined, id => id === atlanta);

        expect(result.outbreaks).toBe(1);
        expect(result.outbrokenCities).toEqual([chicago]);
        expect(result.cubes[atlanta].blue).toBe(0);
    });

    it("blocks an epidemic's Infect step in a protected city entirely", () => {
        const cubes = emptyBoardCubes();
        const chicago = idFor("Chicago");

        const result = placeEpidemicCubesOrOutbreak(cubes, chicago, "blue", undefined, id => id === chicago);

        expect(result.outbreaks).toBe(0);
        expect(result.cubes[chicago].blue).toBe(0);
        expect(result.cubeExhausted).toBe(false);
    });
});

describe("opsExpertBuildsFree / shareKnowledgeCardMatchRequired / dispatcherCanControlOthers (§11)", () => {
    it("only the Operations Expert builds stations for free", () => {
        expect(opsExpertBuildsFree('opsExpert')).toBe(true);
        expect(opsExpertBuildsFree(null)).toBe(false);
        expect(opsExpertBuildsFree('medic')).toBe(false);
    });

    it("only a card leaving the Researcher's own hand is exempt from matching the city", () => {
        expect(shareKnowledgeCardMatchRequired('researcher')).toBe(false);
        expect(shareKnowledgeCardMatchRequired(null)).toBe(true);
        expect(shareKnowledgeCardMatchRequired('medic')).toBe(true);
    });

    it("only the Dispatcher may act on another player's pawn", () => {
        expect(dispatcherCanControlOthers('dispatcher')).toBe(true);
        expect(dispatcherCanControlOthers(null)).toBe(false);
    });
});
