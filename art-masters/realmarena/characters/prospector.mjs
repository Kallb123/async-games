// The Prospector: a dwarf in a long coat in the owner's colour over a leather
// jerkin, a scarf, a broad-brimmed hat, a brown beard, a crossbow levelled in both
// hands and a pick slung across the back.

import { dwarf, DWARF_HEAD } from './kit.mjs';

const [, , headZ] = DWARF_HEAD.at;
const trigger = [0.12, -0.08, 0.36];
const grip = [0.24, 0.04, 0.38];

export const parts = [
    ...dwarf({ torso: 'team', sleeves: 'team', legs: 'darkLeather', girth: 'leather', beard: 'hair', hands: { right: trigger, left: grip } }),
    // The coat's skirt, and the scarf.
    { taper: { from: [0, 0, 0.08], to: [0, 0, 0.26], r: 0.15, r2: 0.13 }, mat: 'team' },
    { taper: { from: [0, 0, 0.44], to: [0, 0, 0.5], r: 0.1, r2: 0.085 }, mat: 'linen' },
    { box: { from: [-0.07, 0.03, 0.48], to: [-0.18, 0.07, 0.36], size: [0.05, 0.015] }, mat: 'linen' },
    // The hat: a low crown on a broad brim, its band of brass.
    { taper: { from: [0, 0, headZ + 0.05], to: [0, 0, headZ + 0.064], r: 0.17, r2: 0.165 }, mat: 'darkLeather' },
    { taper: { from: [0, 0, headZ + 0.06], to: [0, 0, headZ + 0.15], r: 0.095, r2: 0.08 }, mat: 'darkLeather' },
    { taper: { from: [0, 0, headZ + 0.065], to: [0, 0, headZ + 0.09], r: 0.098, r2: 0.096 }, mat: 'brass' },
    // The pick across the back.
    { capsule: { from: [-0.13, -0.12, 0.2], to: [-0.13, 0.12, 0.56], r: 0.014 }, mat: 'wood' },
    { taper: { from: [-0.13, 0.12, 0.56], to: [-0.13, 0.22, 0.48], r: 0.02, r2: 0 }, mat: 'steel' },
    // The crossbow: its stock along the arms, the bow across its front and the string drawn.
    { box: { from: [0.08, -0.07, 0.36], to: [0.34, 0.04, 0.39], size: [0.035, 0.03] }, mat: 'wood' },
    { box: { from: [0.32, -0.12, 0.395], to: [0.36, 0.2, 0.395], size: [0.025, 0.025], roll: 0 }, mat: 'darkSteel' },
    { capsule: { from: [0.32, -0.11, 0.39], to: [0.2, -0.02, 0.4], r: 0.004 }, mat: 'linen' },
    { capsule: { from: [0.35, 0.19, 0.39], to: [0.2, -0.02, 0.4], r: 0.004 }, mat: 'linen' },
    // The bolt on it.
    { capsule: { from: [0.2, -0.02, 0.405], to: [0.4, 0.02, 0.405], r: 0.006 }, mat: 'wood' },
];
