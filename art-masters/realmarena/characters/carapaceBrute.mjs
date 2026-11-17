// The Carapace Brute: the Ravager grown a third again and armoured to match,
// heavy plates of the owner's colour lapping down its back and over its head
// like a shell, and dark chitin plates guarding its flanks.

import { scaled } from './kit.mjs';
import { parts as ravager } from './ravager.mjs';

export const parts = [
    ...scaled(ravager, 1.3),
    // Plates lapping down the back, each overlapping the next.
    { ball: { at: [0.1, 0, 0.5], r: [0.15, 0.24, 0.07], rot: { y: 18 } }, mat: 'team' },
    { ball: { at: [-0.06, 0, 0.5], r: [0.15, 0.25, 0.07], rot: { y: 8 } }, mat: 'team' },
    { ball: { at: [-0.23, 0, 0.45], r: [0.15, 0.24, 0.07], rot: { y: -4 } }, mat: 'team' },
    { ball: { at: [-0.38, 0, 0.37], r: [0.14, 0.21, 0.065], rot: { y: -20 } }, mat: 'team' },
    { ball: { at: [-0.5, 0, 0.29], r: [0.11, 0.16, 0.06], rot: { y: -30 } }, mat: 'chitin' },
    // The plate over the head, and a pauldron on each shoulder.
    { ball: { at: [0.27, 0, 0.45], r: [0.16, 0.15, 0.05], rot: { y: 25 } }, mat: 'team' },
    { ball: { at: [0.06, 0.2, 0.48], r: [0.1, 0.1, 0.075] }, mat: 'team' },
    { ball: { at: [0.06, -0.2, 0.48], r: [0.1, 0.1, 0.075] }, mat: 'team' },
    // Plates on the flanks, over the legs' roots.
    { ball: { at: [0.02, 0.25, 0.3], r: [0.12, 0.05, 0.1] }, mat: 'chitin' },
    { ball: { at: [0.02, -0.25, 0.3], r: [0.12, 0.05, 0.1] }, mat: 'chitin' },
];
