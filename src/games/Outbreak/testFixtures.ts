// Shared test fixtures for Outbreak domain state — a deterministic
// specificGameState to hang a command off, and a city lookup by name.
// OutbreakLogic.test.ts, turnTimeout.test.ts and undo.test.ts all want the
// same one, and a second copy is the signal to extract the first (AGENTS.md).
//
// Test-only. Nothing under src/app imports this.

import { ATLANTA_CITY_ID, CITIES, CITY_COUNT } from "./board";
import { ACTIONS_PER_TURN, CUBES_PER_COLOR, emptyCubeCounts } from "./rules";
import type { IOutbreakPlayerState, IOutbreakSpecificGameState } from "./OutbreakModels";

export function idFor(name: string): number {
    const city = CITIES.find(c => c.name === name);
    if (!city) throw new Error(`unknown city: ${name}`);
    return city.id;
}

// A deterministic state with an empty board and a station only in Atlanta —
// buildInitialOutbreakState's initial infection is real RNG and isn't needed
// to exercise the action phase in isolation.
export function baseState(turnOrder: string[]): IOutbreakSpecificGameState {
    const cities = Array.from({ length: CITY_COUNT }, () => ({ cubes: emptyCubeCounts(), station: false }));
    cities[ATLANTA_CITY_ID].station = true;

    const players = new Map<string, IOutbreakPlayerState>();
    for (const userId of turnOrder) {
        players.set(userId, {
            hand: [],
            city: ATLANTA_CITY_ID,
            role: null,
            contingencyCard: null,
            actionsLeft: ACTIONS_PER_TURN,
            opsExpertFlightUsed: false,
            cubesTreated: 0,
            timesTravelled: 0,
        });
    }

    return {
        difficulty: 'standard',
        cities,
        cubesLeft: { blue: CUBES_PER_COLOR, yellow: CUBES_PER_COLOR, black: CUBES_PER_COLOR, red: CUBES_PER_COLOR },
        cures: { blue: 'none', yellow: 'none', black: 'none', red: 'none' },
        outbreaks: 0,
        infectionRateIndex: 0,
        playerDeck: [],
        playerDiscard: [],
        infectionDeck: [],
        infectionDiscard: [],
        players,
        phase: 'actions',
        oneQuietNightActive: false,
        forecastCards: [],
        forecastResumePhase: null,
        undoStack: [],
        undoAnchorId: null,
    };
}
