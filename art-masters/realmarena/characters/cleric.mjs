// The Cleric: a pale robe with a tabard in the owner's colour, a skullcap,
// and a staff topped with a golden sun.

import { body, HEAD } from './kit.mjs';

const [, , headZ] = HEAD.at;
const staffHand = [0.12, -0.17, 0.44];

export const parts = [
    ...body({ torso: 'linen', sleeves: 'linen', belt: 'gold', hands: { right: staffHand, left: [0.15, 0.12, 0.46] } }),
    // The robe's skirt, to the ground.
    { taper: { from: [0, 0, 0.02], to: [0, 0, 0.34], r: 0.16, r2: 0.11 }, mat: 'linen' },
    // The tabard, front and back, over the robe.
    { box: { at: [0.09, 0, 0.35], size: [0.04, 0.13, 0.42], rot: { y: -8 } }, mat: 'team' },
    { box: { at: [-0.09, 0, 0.35], size: [0.04, 0.13, 0.42], rot: { y: 8 } }, mat: 'team' },
    { box: { at: [0.13, 0, 0.42], size: [0.01, 0.025, 0.11] }, mat: 'gold' },
    { box: { at: [0.13, 0, 0.44], size: [0.01, 0.08, 0.025] }, mat: 'gold' },
    // The skullcap.
    { ball: { at: [-0.01, 0, headZ + 0.04], r: [0.1, 0.1, 0.075] }, mat: 'team' },
    // The staff and its sun: a gold disc and a ring of rays.
    { capsule: { from: [0.12, -0.17, 0.02], to: [0.12, -0.17, 0.82], r: 0.017 }, mat: 'wood' },
    { taper: { from: [0.105, -0.17, 0.9], to: [0.135, -0.17, 0.9], r: 0.05 }, mat: 'gold' },
    ...[0, 45, 90, 135].map(angle => ({
        box: { at: [0.12, -0.17, 0.9], size: [0.02, 0.15, 0.022], rot: { x: angle } }, mat: 'gold',
    })),
];
