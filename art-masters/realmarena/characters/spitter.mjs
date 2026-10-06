// The Spitter: a low, four-legged beast whose tail rears up over its back and
// head, as a scorpion's does, ending in a swollen gland that spits acid
// forward. Its shell is plated in the owner's colour.

import { arc, legPair, limb } from './kit.mjs';

const gland = [0.14, 0, 0.66];

export const parts = [
    // The body, low and long, and its plated back.
    { ball: { at: [-0.04, 0, 0.24], r: [0.17, 0.11, 0.1] }, mat: 'chitin' },
    { ball: { at: [-0.02, 0, 0.27], r: [0.13, 0.095, 0.075] }, mat: 'team' },
    { ball: { at: [-0.03, 0, 0.18], r: [0.13, 0.08, 0.05] }, mat: 'belly' },
    // The head, low and blunt, and its eyes.
    { ball: { at: [0.15, 0, 0.24], r: [0.07, 0.065, 0.06] }, mat: 'chitin' },
    { ball: { at: [0.205, 0.03, 0.26], r: 0.014 }, mat: 'acid' },
    { ball: { at: [0.205, -0.03, 0.26], r: 0.014 }, mat: 'acid' },
    // Four legs.
    ...legPair([0.07, 0.07, 0.24], [0.13, 0.19, 0.3], [0.19, 0.22, 0.01], { r: 0.022 }),
    ...legPair([-0.12, 0.07, 0.22], [-0.18, 0.19, 0.28], [-0.25, 0.21, 0.01], { r: 0.022 }),
    // The tail: up from the rump, over the back, its segments thinning.
    ...arc([-0.12, 0, 0.3], [-0.07, 0, 0.62], [-0.05, 0, 0], { r: 0.045, mat: 'chitin', steps: 5 }),
    ...limb([-0.07, 0, 0.62], [[0.03, 0, 0.71], gland], { r: 0.038, tip: 'chitin' }),
    // Plates down the tail in the owner's colour.
    { ball: { at: [-0.135, 0, 0.42], r: [0.045, 0.055, 0.05] }, mat: 'team' },
    { ball: { at: [-0.11, 0, 0.56], r: [0.045, 0.05, 0.05] }, mat: 'team' },
    // The gland, swollen with acid, and its spout aimed forward.
    { ball: { at: gland, r: [0.07, 0.06, 0.06] }, mat: 'sac' },
    { ball: { at: [gland[0] - 0.01, gland[1], gland[2] + 0.025], r: [0.035, 0.03, 0.025] }, mat: 'acid' },
    { taper: { from: [gland[0] + 0.05, 0, gland[2] - 0.01], to: [gland[0] + 0.12, 0, gland[2] - 0.04], r: 0.025, r2: 0.012 }, mat: 'chitin' },
    { ball: { at: [gland[0] + 0.125, 0, gland[2] - 0.042], r: 0.014 }, mat: 'acid' },
];
