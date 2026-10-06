// The Bloater: a swollen sac of acid carried on four stubby legs, glowing
// through its skin, a plate of shell in the owner's colour across its back
// and a small blind head at the front.

import { legPair } from './kit.mjs';

export const parts = [
    // The sac, and the acid glowing through it in blotches.
    { ball: { at: [-0.02, 0, 0.36], r: [0.23, 0.21, 0.22] }, mat: 'sac' },
    { ball: { at: [0.1, 0.12, 0.42], r: 0.06 }, mat: 'acid' },
    { ball: { at: [0.04, -0.15, 0.32], r: 0.05 }, mat: 'acid' },
    { ball: { at: [0.16, -0.04, 0.28], r: 0.045 }, mat: 'acid' },
    { ball: { at: [-0.12, 0.13, 0.3], r: 0.045 }, mat: 'acid' },
    // The plate across its back, and the ridge down its middle.
    { ball: { at: [-0.05, 0, 0.49], r: [0.2, 0.18, 0.11] }, mat: 'team' },
    { taper: { from: [0.08, 0, 0.56], to: [-0.2, 0, 0.56], r: 0.025 }, mat: 'chitin' },
    // The head, and its mouth.
    { ball: { at: [0.22, 0, 0.3], r: [0.07, 0.07, 0.06] }, mat: 'chitin' },
    { ball: { at: [0.285, 0, 0.29], r: [0.012, 0.035, 0.012] }, mat: 'acid' },
    // Four stubby legs.
    ...legPair([0.1, 0.13, 0.22], [0.16, 0.2, 0.14], [0.18, 0.22, 0.01], { r: 0.035 }),
    ...legPair([-0.13, 0.13, 0.22], [-0.19, 0.2, 0.14], [-0.21, 0.22, 0.01], { r: 0.035 }),
];
