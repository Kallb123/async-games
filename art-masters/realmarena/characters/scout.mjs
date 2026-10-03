// The Scout: lean and low, in dark leather with a scarf and headband in the
// owner's colour, a knife in each hand.

import { body, HEAD } from './kit.mjs';

const crouch = 0.04;
const [, , headZ] = HEAD.at;
const z = headZ - crouch;
const knife = (hand, side) => [
    { capsule: { from: hand, to: [hand[0] + 0.03, hand[1], hand[2] + 0.02], r: 0.016 }, mat: 'darkLeather' },
    { box: { from: [hand[0] + 0.03, hand[1], hand[2] + 0.02], to: [hand[0] + 0.15, hand[1] + side * 0.02, hand[2] - 0.02], size: [0.035, 0.01], roll: 90 }, mat: 'steel' },
];
const right = [0.15, -0.15, 0.32], left = [0.12, 0.15, 0.36];

export const parts = [
    ...body({
        torso: 'darkLeather', sleeves: 'leather', legs: 'darkLeather', boots: 'leather', belt: 'leather',
        hands: { right, left }, stance: 0.085, crouch,
    }),
    // A scarf round the neck, its tail flying back, and a headband.
    { taper: { from: [0, 0, 0.56], to: [0, 0, 0.61], r: 0.085, r2: 0.07 }, mat: 'team' },
    { box: { from: [-0.06, 0.02, 0.59], to: [-0.2, 0.06, 0.5], size: [0.05, 0.015] }, mat: 'team' },
    { taper: { from: [0, 0, z + 0.03], to: [0, 0, z + 0.06], r: 0.108 }, mat: 'team' },
    { ball: { at: [-0.01, 0, z + 0.06], r: [0.1, 0.1, 0.06] }, mat: 'hair' },
    ...knife(right, -1),
    ...knife(left, 1),
];
