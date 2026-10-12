// The Runepriest: a dwarf in a long robe in the owner's colour over mail, a
// white beard to the belt, a hood, and a stone-headed hammer whose rune
// glows.

import { dwarf, DWARF_HEAD } from './kit.mjs';

const [, , headZ] = DWARF_HEAD.at;
const hammerHand = [0.12, -0.17, 0.34];
const [hx, hy] = hammerHand;

export const parts = [
    ...dwarf({ torso: 'darkSteel', sleeves: 'team', girth: 'team', belt: 'gold', beard: 'linen', hands: { right: hammerHand, left: [0.15, 0.13, 0.36] } }),
    // The robe's skirt, to the ground.
    { taper: { from: [0, 0, 0.02], to: [0, 0, 0.26], r: 0.17, r2: 0.13 }, mat: 'team' },
    // The hood, thrown back over the shoulders, and a band round the brow.
    { ball: { at: [-0.04, 0, headZ - 0.01], r: [0.1, 0.12, 0.1] }, mat: 'team' },
    { taper: { from: [0, 0, headZ + 0.04], to: [0, 0, headZ + 0.065], r: 0.108 }, mat: 'gold' },
    // The hammer: a long haft, a block of stone, and its rune glowing on each face.
    { capsule: { from: [hx, hy, 0.04], to: [hx, hy, 0.74], r: 0.017 }, mat: 'wood' },
    { box: { at: [hx, hy, 0.78], size: [0.16, 0.09, 0.09] }, mat: 'stone' },
    { box: { at: [hx, hy, 0.78], size: [0.17, 0.035, 0.05] }, mat: 'rune' },
    { box: { at: [hx, hy, 0.78], size: [0.06, 0.1, 0.05] }, mat: 'rune' },
];
