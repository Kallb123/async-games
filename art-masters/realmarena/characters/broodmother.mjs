// The Broodmother: the Swarm's leader, standing tall over a heavy egg-sac on
// four legs, her upright body plated in the owner's colour, a crown of bone
// spines and two clawed arms.

import { legPair, limb } from './kit.mjs';

const headZ = 0.76;

export const parts = [
    // The egg-sac behind, and its glowing eggs.
    { ball: { at: [-0.19, 0, 0.27], r: [0.2, 0.15, 0.15], rot: { y: -10 } }, mat: 'sac' },
    { ball: { at: [-0.3, 0.07, 0.3], r: 0.04 }, mat: 'acid' },
    { ball: { at: [-0.25, -0.08, 0.36], r: 0.035 }, mat: 'acid' },
    { ball: { at: [-0.2, 0.1, 0.38], r: 0.03 }, mat: 'acid' },
    // The lower body the legs hang from.
    { ball: { at: [0.0, 0, 0.3], r: [0.12, 0.12, 0.1] }, mat: 'chitin' },
    ...legPair([0.05, 0.08, 0.28], [0.14, 0.22, 0.32], [0.2, 0.25, 0.01], { r: 0.026 }),
    ...legPair([-0.06, 0.08, 0.26], [-0.12, 0.22, 0.3], [-0.16, 0.26, 0.01], { r: 0.026 }),
    // The upright body, plated, and its pale belly.
    { ball: { at: [0.04, 0, 0.52], r: [0.1, 0.13, 0.18] }, mat: 'team' },
    { ball: { at: [0.09, 0, 0.5], r: [0.06, 0.09, 0.13] }, mat: 'belly' },
    // The head, the crown of spines, and the eyes.
    { ball: { at: [0.07, 0, headZ], r: [0.08, 0.075, 0.075] }, mat: 'chitin' },
    { taper: { from: [0.03, 0, headZ + 0.05], to: [-0.04, 0, headZ + 0.2], r: 0.03, r2: 0 }, mat: 'bone' },
    { taper: { from: [0.03, 0.04, headZ + 0.04], to: [-0.03, 0.12, headZ + 0.16], r: 0.025, r2: 0 }, mat: 'bone' },
    { taper: { from: [0.03, -0.04, headZ + 0.04], to: [-0.03, -0.12, headZ + 0.16], r: 0.025, r2: 0 }, mat: 'bone' },
    { ball: { at: [0.135, 0.03, headZ + 0.01], r: 0.016 }, mat: 'acid' },
    { ball: { at: [0.135, -0.03, headZ + 0.01], r: 0.016 }, mat: 'acid' },
    // Two clawed arms, reaching forward.
    ...limb([0.04, 0.13, 0.62], [[0.12, 0.2, 0.5], [0.24, 0.17, 0.54], [0.3, 0.12, 0.48]], { r: 0.026 }),
    ...limb([0.04, -0.13, 0.62], [[0.12, -0.2, 0.5], [0.24, -0.17, 0.54], [0.3, -0.12, 0.48]], { r: 0.026 }),
];
