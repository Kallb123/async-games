// The cut stone the 3D board builds its castle of (terrain3d.ts): the sides of
// a wall, a parapet, a tower or a heap of rubble are courses of ashlar, and a
// top that isn't the art's own is paved with flagstones. The isometric sheet's
// brick is a few pixels a course and drawn in shade for one face, so unwarped
// onto a box it smears; this is drawn instead, in that brick's colours, at a
// size that stays sharp close up.
//
// The layout (`coursesOf`) is pure, and tested; `stoneCanvas` paints it.

import type { Color } from "three";

/** One stone of a face, in world units: `x` along a face that repeats, which it may run off the end of and wrap round onto the start; `y` down from the face's top. */
export interface Stone {
    x: number;
    y: number;
    width: number;
    height: number;
    /** 0–1, which stone this is to the painter: how light it's cut, and where it's weathered. */
    seed: number;
}

/** A repeatable 0–1 from a number: well mixed, so neighbouring inputs land far apart. */
export function hashed(n: number): number {
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return ((n ^ (n >>> 16)) >>> 0) / 2 ** 32;
}

/**
 * `courses` courses of stone, each `height` tall, along a face `width` long
 * that repeats side to side: every course is a run of stones `lengths` long
 * that adds up to the width exactly, wrapping round, and each starts half way
 * along the first stone of the course above, so no joint runs straight up
 * through two courses.
 */
export function coursesOf(courses: number, height: number, [shortest, longest]: readonly [number, number], width: number, seed: number): Stone[] {
    const stones: Stone[] = [];
    let start = hashed(seed) * width;
    let draw = seed * 7919;
    const next = () => hashed(++draw);
    for (let course = 0; course < courses; course++) {
        const from = start, end = start + width;
        for (let x = from; x < end - 1e-9;) {
            const left = end - x;
            // The course's last stone closes it; any other leaves room for at least one more.
            const length = left <= longest ? left : shortest + next() * (Math.min(longest, left - shortest) - shortest);
            if (x === from) start = (x + length / 2) % width;
            stones.push({ x: x % width, y: course * height, width: length, height, seed: next() });
            x += length;
        }
    }
    return stones;
}

/** Stones course by course, how much of a world unit is joint between neighbours, and how much of an edge is bevelled. */
const JOINT = 0.022;
const BEVEL = 0.014;

/** `colour` times `k`, a CSS colour: `k` above 1 lightens, clamped. */
const css = (colour: Color, k: number, hue = 0) =>
    `rgb(${[colour.r * (1 + hue), colour.g, colour.b * (1 - hue)].map(c => Math.round(255 * Math.min(1, Math.max(0, c * k)))).join(",")})`;

/**
 * `stones` painted onto a canvas `texels` to a world unit, `width` × `height`
 * world units, in `colour` (sRGB 0–1, as lit): dark mortar between them, each
 * stone a shade of its own with a light top edge and a shadowed foot, a little
 * weathered, and a fine grain over the whole. Repeats side to side and top to
 * bottom as the layout does.
 */
export function stoneCanvas(stones: readonly Stone[], width: number, height: number, texels: number, colour: Color): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * texels);
    canvas.height = Math.round(height * texels);
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    context.fillStyle = css(colour, 0.45);
    context.fillRect(0, 0, width, height);
    for (const stone of stones) {
        // A stone running off the right-hand edge is drawn again off the left, where the face wraps round onto it.
        for (const x of stone.x + stone.width > width ? [stone.x, stone.x - width] : [stone.x]) {
            const [l, t, w, h] = [x + JOINT / 2, stone.y + JOINT / 2, stone.width - JOINT, stone.height - JOINT];
            const pick = (use: number) => hashed(Math.floor(stone.seed * 2 ** 31) + use);
            context.save();
            context.beginPath();
            context.rect(l, t, w, h);
            context.clip();
            context.fillStyle = css(colour, 0.9 + 0.28 * pick(1), 0.08 * (pick(2) - 0.5));
            context.fillRect(l, t, w, h);
            // Weathering: a soft stain or two, darker or paler than the stone.
            for (let stain = 0; stain < 3; stain++) {
                const [cx, cy, r] = [l + w * pick(10 + stain), t + h * pick(20 + stain), h * (0.4 + 0.8 * pick(30 + stain))];
                const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, r);
                gradient.addColorStop(0, pick(40 + stain) > 0.5 ? "rgba(40, 28, 16, 0.18)" : "rgba(255, 246, 225, 0.14)");
                gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
                context.fillStyle = gradient;
                context.fillRect(l, t, w, h);
            }
            // Lit from above: a pale top edge, a shadowed foot, and both ends a little dark (the light comes from whichever side the camera's on).
            context.fillStyle = "rgba(255, 244, 220, 0.32)";
            context.fillRect(l, t, w, BEVEL);
            context.fillStyle = "rgba(30, 20, 10, 0.34)";
            context.fillRect(l, t + h - BEVEL, w, BEVEL);
            context.fillStyle = "rgba(30, 20, 10, 0.14)";
            context.fillRect(l, t, BEVEL, h);
            context.fillRect(l + w - BEVEL, t, BEVEL, h);
            context.restore();
        }
    }
    // A fine grain over everything, texel by texel, so a stone close up is stone and not a flat colour.
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = image;
    for (let i = 0; i < data.length; i += 4) {
        const k = 0.9 + 0.2 * hashed(i);
        data[i] *= k;
        data[i + 1] *= k;
        data[i + 2] *= k;
    }
    context.putImageData(image, 0, 0);
    return canvas;
}
