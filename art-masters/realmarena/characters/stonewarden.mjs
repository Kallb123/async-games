// The Stonewarden: a dwarf in plate from head to foot, a great helm with a
// face guard and a crest in the owner's colour, a long grey beard, a war pick
// and a tall stone-faced shield bearing the owner's colour.

import { dwarf, DWARF_HEAD, pick } from './kit.mjs';

const [, , headZ] = DWARF_HEAD.at;
const pickHand = [0.14, -0.18, 0.32];

export const parts = [
    ...dwarf({
        torso: 'steel', sleeves: 'steel', legs: 'darkSteel', boots: 'iron', belt: 'darkLeather', skin: 'iron', beard: 'beard',
        hands: { right: pickHand, left: [0.13, 0.17, 0.32] }, stance: 0.09,
    }),
    // A surcoat's skirt in the owner's colour, under the plate.
    { taper: { from: [0, 0, 0.1], to: [0, 0, 0.23], r: 0.14, r2: 0.125 }, mat: 'team' },
    // The helm: a squat drum, a dark slit across the eyes, and the crest.
    { taper: { from: [0, 0, headZ - 0.03], to: [0, 0, headZ + 0.1], r: 0.112, r2: 0.1 }, mat: 'steel' },
    { box: { at: [0.105, 0, headZ + 0.03], size: [0.02, 0.15, 0.02] }, mat: 'eye' },
    { box: { at: [-0.01, 0, headZ + 0.13], size: [0.2, 0.03, 0.06] }, mat: 'team' },
    // The war pick, held low and ready.
    ...pick(pickHand, [0.24, -0.18, 0.5], { head: 'darkSteel', reach: 0.13 }),
    // The shield: a tall slab of stone rimmed in iron, the owner's colour on its face.
    { box: { at: [0.18, 0.2, 0.3], size: [0.04, 0.26, 0.42], rot: { z: 15 } }, mat: 'iron' },
    { box: { at: [0.2, 0.2, 0.3], size: [0.02, 0.21, 0.36], rot: { z: 15 } }, mat: 'stone' },
    { box: { at: [0.215, 0.2, 0.32], size: [0.012, 0.12, 0.2], rot: { z: 15 } }, mat: 'team' },
];
