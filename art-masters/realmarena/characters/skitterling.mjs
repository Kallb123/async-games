// The Skitterling: the Swarm's smallest, low to the ground on six thin legs,
// its back plated in the owner's colour and a pair of hooked claws held up
// before its jaws.

import { legPair, limbPair } from './kit.mjs';

export const parts = [
    // The abdomen, trailing low behind, and the plated thorax ahead of it.
    { ball: { at: [-0.13, 0, 0.17], r: [0.13, 0.095, 0.085], rot: { y: -12 } }, mat: 'chitin' },
    { ball: { at: [-0.12, 0, 0.13], r: [0.1, 0.075, 0.05] }, mat: 'belly' },
    { ball: { at: [0.03, 0, 0.21], r: [0.095, 0.085, 0.075] }, mat: 'team' },
    // Ridges across the abdomen.
    { taper: { from: [-0.09, 0, 0.16], to: [-0.07, 0, 0.17], r: 0.092 }, mat: 'chitin' },
    // The head, its eyes and jaws.
    { ball: { at: [0.14, 0, 0.22], r: [0.065, 0.06, 0.055] }, mat: 'chitin' },
    { ball: { at: [0.185, 0.03, 0.245], r: 0.014 }, mat: 'acid' },
    { ball: { at: [0.185, -0.03, 0.245], r: 0.014 }, mat: 'acid' },
    ...limbPair([0.18, 0.025, 0.2], [[0.23, 0.01, 0.18]], { r: 0.01 }),
    // Six legs, splayed.
    ...legPair([0.05, 0.06, 0.2], [0.12, 0.17, 0.28], [0.2, 0.22, 0.01], { r: 0.017 }),
    ...legPair([-0.01, 0.07, 0.19], [0.0, 0.19, 0.27], [0.01, 0.25, 0.01], { r: 0.017 }),
    ...legPair([-0.07, 0.06, 0.18], [-0.13, 0.17, 0.25], [-0.2, 0.22, 0.01], { r: 0.017 }),
    // The hooked claws, raised before the jaws.
    ...limbPair([0.08, 0.06, 0.24], [[0.16, 0.1, 0.36], [0.26, 0.07, 0.3]], { r: 0.018 }),
];
