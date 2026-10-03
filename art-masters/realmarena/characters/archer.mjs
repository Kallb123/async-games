// The Archer: a hood and cape in the owner's colour over a green tunic, a
// longbow held out in the left hand and a quiver of arrows on the back.

import { arc, body, HEAD } from './kit.mjs';

const [, , headZ] = HEAD.at;
const bowHand = [0.22, 0.12, 0.5];
const stringHand = [0.06, -0.06, 0.52];

export const parts = [
    ...body({ torso: 'forest', sleeves: 'forest', legs: 'leather', hands: { right: stringHand, left: bowHand } }),
    // The hood, with its point hanging down the back, and the cape.
    { ball: { at: [-0.012, 0, headZ + 0.012], r: [0.115, 0.118, 0.115] }, mat: 'team' },
    { ball: { at: [0.03, 0, headZ - 0.005], r: [0.1, 0.098, 0.1] }, mat: 'skin' },
    { taper: { from: [-0.08, 0, headZ + 0.02], to: [-0.18, 0, headZ - 0.1], r: 0.06, r2: 0 }, mat: 'team' },
    { box: { at: [-0.085, 0, 0.45], size: [0.03, 0.27, 0.26], rot: { y: -8 } }, mat: 'team' },
    // Eyes again, in front of the hood's shadow.
    { ball: { at: [0.123, 0.036, headZ + 0.005], r: 0.016 }, mat: 'eye' },
    { ball: { at: [0.123, -0.036, headZ + 0.005], r: 0.016 }, mat: 'eye' },
    // The quiver on the back, and the fletching sticking out of it.
    { taper: { from: [-0.12, -0.05, 0.3], to: [-0.14, 0.07, 0.62], r: 0.045 }, mat: 'darkLeather' },
    { box: { at: [-0.14, 0.06, 0.66], size: [0.03, 0.03, 0.07], rot: { x: 20 } }, mat: 'feather' },
    { box: { at: [-0.15, 0.09, 0.65], size: [0.03, 0.03, 0.07], rot: { x: 30 } }, mat: 'feather' },
    // The bow, upright in front, and its string drawn back to the right hand.
    ...arc([0.2, 0.12, 0.2], [0.2, 0.12, 0.8], [0.06, 0, 0], { r: 0.014, mat: 'wood' }),
    { capsule: { from: [0.2, 0.12, 0.2], to: stringHand, r: 0.005 }, mat: 'linen' },
    { capsule: { from: stringHand, to: [0.2, 0.12, 0.8], r: 0.005 }, mat: 'linen' },
    // The arrow on the string.
    { capsule: { from: stringHand, to: [0.32, 0.11, 0.51], r: 0.007 }, mat: 'wood' },
    { taper: { from: [0.32, 0.11, 0.51], to: [0.36, 0.11, 0.508], r: 0.016, r2: 0 }, mat: 'darkSteel' },
];
