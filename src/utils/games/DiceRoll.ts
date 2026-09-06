import { randomInt } from "./random";

/**
 * One die of `diceNumber` faces, from 1. Every game's rolls go through here —
 * see `random.ts` for why it is the CSPRNG rather than `Math.random()`.
 */
export function DiceRoll(diceNumber: number): number {
    return 1 + randomInt(diceNumber);
}
