// Test-only. Kept out of testFixtures.ts so the balance harness, which imports
// testFixtures under tsx, never loads vitest (importing it outside a test run throws).

import { vi } from "vitest";

/** Every roll from here on drawn from a seed, so a battle plays the same each run (mulberry32). */
export function seedRolls(seed: number): void {
    let state = seed >>> 0;
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        const values = array as unknown as Uint32Array;
        for (let i = 0; i < values.length; i++) {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            values[i] = (t ^ (t >>> 14)) >>> 0;
        }
        return array;
    });
}
