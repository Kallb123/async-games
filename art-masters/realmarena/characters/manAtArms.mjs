// The Man-at-arms: a padded coat in the owner's colour, a kettle hat, a sword
// held ready and a round wooden buckler.

import { body, HEAD } from './kit.mjs';

const top = HEAD.at[2] + 0.05;
const swordHand = [0.15, -0.16, 0.38];

export const parts = [
    ...body({ torso: 'team', sleeves: 'team', legs: 'cloth', hands: { right: swordHand, left: [0.13, 0.17, 0.42] } }),
    // The kettle hat: a dome with a wide brim.
    { ball: { at: [0, 0, top + 0.01], r: [0.105, 0.105, 0.075] }, mat: 'steel' },
    { taper: { from: [0, 0, top - 0.005], to: [0, 0, top + 0.01], r: 0.145, r2: 0.138 }, mat: 'steel' },
    // The sword: grip, cross-guard and blade, raised forward.
    { capsule: { from: [0.13, -0.16, 0.34], to: [0.16, -0.16, 0.42], r: 0.018 }, mat: 'leather' },
    { box: { from: [0.155, -0.22, 0.43], to: [0.165, -0.1, 0.43], size: [0.03, 0.03] }, mat: 'darkSteel' },
    { box: { from: [0.165, -0.16, 0.44], to: [0.34, -0.16, 0.74], size: [0.05, 0.014], roll: 90 }, mat: 'steel' },
    // The buckler on the left forearm, facing out.
    { taper: { from: [0.16, 0.19, 0.42], to: [0.19, 0.2, 0.42], r: 0.12 }, mat: 'wood' },
    { ball: { at: [0.195, 0.2, 0.42], r: 0.04 }, mat: 'steel' },
];
