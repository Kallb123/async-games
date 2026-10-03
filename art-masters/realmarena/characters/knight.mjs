// The Knight: plate from head to foot, a surcoat and a plume in the owner's
// colour, a great helm, a mace and a kite shield bearing the owner's colour.

import { body, HEAD } from './kit.mjs';

const [, , headZ] = HEAD.at;

export const parts = [
    ...body({
        torso: 'steel', sleeves: 'steel', legs: 'steel', boots: 'darkSteel', belt: 'darkLeather', skin: 'darkSteel',
        hands: { right: [0.14, -0.17, 0.4], left: [0.12, 0.17, 0.44] }, stance: 0.075, head: false,
    }),
    // The surcoat over the breastplate, and its skirt.
    { ball: { at: [0.012, 0, 0.44], r: [0.1, 0.13, 0.15] }, mat: 'team' },
    { taper: { from: [0, 0, 0.18], to: [0, 0, 0.32], r: 0.125, r2: 0.115 }, mat: 'team' },
    { taper: { from: [0, 0, 0.3], to: [0, 0, 0.34], r: 0.122 }, mat: 'darkLeather' },
    // The great helm: a flat-topped drum with a dark slit across the eyes.
    { taper: { from: [0, 0, headZ - 0.1], to: [0, 0, headZ + 0.1], r: 0.105, r2: 0.098 }, mat: 'steel' },
    { box: { at: [0.098, 0, headZ + 0.015], size: [0.02, 0.16, 0.022] }, mat: 'eye' },
    { box: { at: [0.1, 0, headZ - 0.04], size: [0.012, 0.012, 0.09] }, mat: 'darkSteel' },
    // The plume.
    { ball: { at: [-0.02, 0, headZ + 0.15], r: [0.075, 0.035, 0.06], rot: { y: 25 } }, mat: 'team' },
    // The mace: a haft and a flanged head, held up.
    { capsule: { from: [0.12, -0.17, 0.34], to: [0.2, -0.17, 0.62], r: 0.018 }, mat: 'wood' },
    { ball: { at: [0.215, -0.17, 0.66], r: 0.05 }, mat: 'darkSteel' },
    { box: { at: [0.215, -0.17, 0.66], size: [0.13, 0.025, 0.06] }, mat: 'darkSteel' },
    { box: { at: [0.215, -0.17, 0.66], size: [0.025, 0.13, 0.06] }, mat: 'darkSteel' },
    // The kite shield on the left arm: a steel-rimmed board in the owner's colour.
    { box: { at: [0.17, 0.2, 0.42], size: [0.03, 0.24, 0.26], rot: { z: 15 } }, mat: 'steel' },
    { box: { at: [0.19, 0.2, 0.42], size: [0.02, 0.2, 0.22], rot: { z: 15 } }, mat: 'team' },
    // Its point: a square turned onto its corner, half hidden behind the board.
    { box: { at: [0.17, 0.2, 0.29], size: [0.03, 0.17, 0.17], rot: { z: 15, x: 45 } }, mat: 'steel' },
    { box: { at: [0.19, 0.2, 0.3], size: [0.02, 0.14, 0.14], rot: { z: 15, x: 45 } }, mat: 'team' },
];
