/** A small, reproducible PRNG suitable for world generation (not security). */
export interface RandomSource {
    next(): number;
    between(min: number, max: number): number;
    integer(maxExclusive: number): number;
    shuffle<T>(values: readonly T[]): T[];
}

function hashSeed(seed: string): number {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function createRandom(seed: string): RandomSource {
    let state = hashSeed(seed) || 0x9e3779b9;
    const next = (): number => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };

    return {
        next,
        between: (min, max) => min + next() * (max - min),
        integer: maxExclusive => Math.floor(next() * maxExclusive),
        shuffle: <T>(values: readonly T[]) => {
            const copy = [...values];
            for (let index = copy.length - 1; index > 0; index--) {
                const other = Math.floor(next() * (index + 1));
                [copy[index], copy[other]] = [copy[other], copy[index]];
            }
            return copy;
        },
    };
}
