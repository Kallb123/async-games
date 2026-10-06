// The Ravager: the Swarm's brawler, hulking and hunched on four thick legs,
// its shell plated in the owner's colour, a crest of bone along its head and
// a pair of great scything talons arched up over it.

import { legPair, limb } from './kit.mjs';

export const parts = [
    // The heavy abdomen behind, and the thorax plated in the owner's colour.
    { ball: { at: [-0.17, 0, 0.24], r: [0.18, 0.15, 0.13], rot: { y: -15 } }, mat: 'chitin' },
    { ball: { at: [-0.15, 0, 0.17], r: [0.13, 0.11, 0.07] }, mat: 'belly' },
    { ball: { at: [0.02, 0, 0.32], r: [0.16, 0.16, 0.15] }, mat: 'team' },
    { ball: { at: [0.05, 0, 0.25], r: [0.12, 0.12, 0.08] }, mat: 'belly' },
    // Spines along its back.
    { taper: { from: [-0.04, 0, 0.45], to: [-0.1, 0, 0.56], r: 0.032, r2: 0 }, mat: 'bone' },
    { taper: { from: [-0.14, 0, 0.36], to: [-0.22, 0, 0.45], r: 0.028, r2: 0 }, mat: 'bone' },
    { taper: { from: [-0.25, 0, 0.3], to: [-0.33, 0, 0.37], r: 0.024, r2: 0 }, mat: 'bone' },
    // The head, thrust forward, its crest, its eyes and its mandibles.
    { ball: { at: [0.19, 0, 0.32], r: [0.09, 0.08, 0.075] }, mat: 'chitin' },
    { taper: { from: [0.16, 0, 0.38], to: [0.06, 0, 0.47], r: 0.04, r2: 0.005 }, mat: 'bone' },
    { ball: { at: [0.26, 0.036, 0.345], r: 0.017 }, mat: 'acid' },
    { ball: { at: [0.26, -0.036, 0.345], r: 0.017 }, mat: 'acid' },
    ...limb([0.24, 0.045, 0.29], [[0.31, 0.035, 0.25], [0.32, 0.0, 0.23]], { r: 0.015 }),
    ...limb([0.24, -0.045, 0.29], [[0.31, -0.035, 0.25], [0.32, 0.0, 0.23]], { r: 0.015 }),
    // Four thick legs, bent low and wide.
    ...legPair([0.08, 0.12, 0.26], [0.16, 0.28, 0.3], [0.22, 0.31, 0.01], { r: 0.038 }),
    ...legPair([-0.14, 0.12, 0.2], [-0.2, 0.28, 0.26], [-0.28, 0.3, 0.01], { r: 0.038 }),
    // The scything talons, arched up and over, their blades curling forward.
    ...limb([0.08, 0.14, 0.4], [[0.08, 0.21, 0.62], [0.22, 0.2, 0.74], [0.34, 0.16, 0.54]], { r: 0.032 }),
    ...limb([0.08, -0.14, 0.4], [[0.08, -0.21, 0.62], [0.22, -0.2, 0.74], [0.34, -0.16, 0.54]], { r: 0.032 }),
];
