// The Mage: a long robe in the owner's colour, a tall pointed hat, a grey
// beard and a staff crowned with fire.

import { body, HEAD } from './kit.mjs';

const [, , headZ] = HEAD.at;
const staffHand = [0.1, -0.17, 0.42];

export const parts = [
    ...body({ torso: 'team', sleeves: 'team', belt: 'gold', hands: { right: staffHand, left: [0.12, 0.13, 0.38] } }),
    // The robe's skirt, to the ground.
    { taper: { from: [0, 0, 0.02], to: [0, 0, 0.34], r: 0.17, r2: 0.11 }, mat: 'team' },
    // The beard, falling from the chin.
    { taper: { from: [0.07, 0, headZ - 0.03], to: [0.1, 0, headZ - 0.19], r: 0.06, r2: 0 }, mat: 'beard' },
    // The hat: a broad brim and a cone leaning back.
    { taper: { from: [0, 0, headZ + 0.06], to: [0, 0, headZ + 0.075], r: 0.165, r2: 0.155 }, mat: 'night' },
    { taper: { from: [0, 0, headZ + 0.07], to: [-0.05, 0, headZ + 0.33], r: 0.095, r2: 0 }, mat: 'night' },
    { taper: { from: [0, 0, headZ + 0.07], to: [0, 0, headZ + 0.095], r: 0.098, r2: 0.09 }, mat: 'gold' },
    // The staff, upright in the right hand, and the fire at its head.
    { capsule: { from: [0.1, -0.17, 0.02], to: [0.1, -0.17, 0.86], r: 0.018 }, mat: 'wood' },
    { taper: { from: [0.1, -0.17, 0.84], to: [0.1, -0.17, 0.9], r: 0.03, r2: 0.045 }, mat: 'gold' },
    { ball: { at: [0.1, -0.17, 0.95], r: 0.05 }, mat: 'flame' },
    { ball: { at: [0.11, -0.18, 0.955], r: 0.03 }, mat: 'fire' },
];
