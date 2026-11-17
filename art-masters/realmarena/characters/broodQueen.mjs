// The Brood Queen: the Broodmother grown a quarter again, and carrying a
// far bigger egg-sac — a vast pale bulge dragged behind her, its eggs
// glowing through the skin. The rest of her is the Broodmother's.

import { parts as broodmother } from './broodmother.mjs';
import { scaled } from './kit.mjs';

export const parts = [
    ...scaled(broodmother, 1.25),
    // The great sac, swallowing the old one, and its swollen eggs.
    { ball: { at: [-0.4, 0, 0.3], r: [0.3, 0.23, 0.23], rot: { y: -10 } }, mat: 'sac' },
    { ball: { at: [-0.58, 0.08, 0.35], r: 0.06 }, mat: 'acid' },
    { ball: { at: [-0.5, -0.14, 0.46], r: 0.055 }, mat: 'acid' },
    { ball: { at: [-0.4, 0.17, 0.44], r: 0.05 }, mat: 'acid' },
    { ball: { at: [-0.46, 0.02, 0.52], r: 0.05 }, mat: 'acid' },
    { ball: { at: [-0.34, -0.17, 0.36], r: 0.045 }, mat: 'acid' },
];
