// The Miner: a dwarf in a tunic in the owner's colour under a leather apron,
// a miner's helmet with its lamp lit, a red beard, and a pickaxe raised to
// swing.

import { dwarf, DWARF_HEAD, pick } from './kit.mjs';

const [, , headZ] = DWARF_HEAD.at;
const pickHand = [0.13, -0.17, 0.34];

export const parts = [
    ...dwarf({ torso: 'team', sleeves: 'team', legs: 'cloth', hands: { right: pickHand, left: [0.15, 0.15, 0.3] } }),
    // The apron down the front.
    { box: { at: [0.12, 0, 0.24], size: [0.03, 0.18, 0.24], rot: { y: -6 } }, mat: 'leather' },
    // The helmet: a dome with a brim, and the lamp on its brow.
    { ball: { at: [0, 0, headZ + 0.035], r: [0.112, 0.112, 0.085] }, mat: 'brass' },
    { taper: { from: [0, 0, headZ + 0.02], to: [0, 0, headZ + 0.035], r: 0.135, r2: 0.13 }, mat: 'brass' },
    { taper: { from: [0.085, 0, headZ + 0.065], to: [0.125, 0, headZ + 0.07], r: 0.032 }, mat: 'darkLeather' },
    { ball: { at: [0.13, 0, headZ + 0.07], r: 0.026 }, mat: 'lamp' },
    // The pickaxe, raised over the shoulder.
    ...pick(pickHand, [0.05, -0.2, 0.74], { reach: 0.17 }),
];
