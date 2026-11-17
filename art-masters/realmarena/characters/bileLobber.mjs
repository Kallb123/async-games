// The Bile Lobber: the Spitter grown a quarter again, its tail rearing the
// same over its back but ending in a hugely swollen gland — a bloated bulb
// of acid, sloshing near the top and ready to burst forward.

import { scaled } from './kit.mjs';
import { parts as spitter } from './spitter.mjs';

const gland = [0.18, 0, 0.82];

export const parts = [
    ...scaled(spitter, 1.25),
    // The gland, swallowing the old one, with a pool of acid on top and its spout.
    { ball: { at: gland, r: [0.16, 0.14, 0.14] }, mat: 'sac' },
    { ball: { at: [gland[0] - 0.02, 0, gland[2] + 0.09], r: [0.09, 0.08, 0.05] }, mat: 'acid' },
    { ball: { at: [gland[0] + 0.05, 0.1, gland[2] - 0.04], r: 0.035 }, mat: 'acid' },
    { taper: { from: [gland[0] + 0.12, 0, gland[2] - 0.02], to: [gland[0] + 0.26, 0, gland[2] - 0.07], r: 0.05, r2: 0.025 }, mat: 'chitin' },
    { ball: { at: [gland[0] + 0.265, 0, gland[2] - 0.072], r: 0.025 }, mat: 'acid' },
];
