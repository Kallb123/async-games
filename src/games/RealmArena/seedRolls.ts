// Test-only. Kept out of testFixtures.ts so the balance harness, which imports
// testFixtures under tsx, never loads vitest (importing it outside a test run throws).

import { vi } from "vitest";
import { seededRandomValues } from "./testFixtures";

/** Every roll from here on drawn from a seed, so a battle plays the same each run (mulberry32). */
export function seedRolls(seed: number): void {
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(seededRandomValues(seed));
}
