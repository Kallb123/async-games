// The Sapper: a dwarf in a jerkin in the owner's colour, goggles pushed up on
// a leather cap, a red beard singed short, a bandolier of dynamite across the
// chest, and a lit stick raised in the right hand to throw.

import { dwarf, DWARF_HEAD, dynamiteStick } from './kit.mjs';

const [, , headZ] = DWARF_HEAD.at;
const throwHand = [0.02, -0.2, 0.62];

export const parts = [
    ...dwarf({
        torso: 'team', sleeves: 'darkLeather', legs: 'cloth', girth: 'team',
        hands: { right: throwHand, left: [0.15, 0.15, 0.3] }, elbows: { right: [-0.04, -0.24, 0.48] },
    }),
    // The cap, and the goggles on it.
    { ball: { at: [-0.005, 0, headZ + 0.035], r: [0.11, 0.11, 0.08] }, mat: 'darkLeather' },
    { taper: { from: [0, 0, headZ + 0.045], to: [0, 0, headZ + 0.07], r: 0.114, r2: 0.112 }, mat: 'darkLeather' },
    { taper: { from: [0.085, 0.04, headZ + 0.07], to: [0.115, 0.045, headZ + 0.075], r: 0.03 }, mat: 'brass' },
    { taper: { from: [0.085, -0.04, headZ + 0.07], to: [0.115, -0.045, headZ + 0.075], r: 0.03 }, mat: 'brass' },
    // The bandolier, shoulder to hip, and the sticks in it.
    { box: { from: [0.12, 0.14, 0.46], to: [0.13, -0.12, 0.2], size: [0.06, 0.02], roll: 90 }, mat: 'darkLeather' },
    ...[[0.14, 0.09, 0.4], [0.145, 0.02, 0.33], [0.145, -0.05, 0.26]].flatMap(([x, y, z]) => dynamiteStick([x, y + 0.02, z - 0.06], [x, y, z + 0.04])),
    // The lit stick, held up to throw.
    ...dynamiteStick([throwHand[0] - 0.02, throwHand[1], throwHand[2] - 0.05], [throwHand[0] + 0.02, throwHand[1], throwHand[2] + 0.07], { lit: true }),
];
