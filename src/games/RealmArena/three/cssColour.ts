// A CSS colour as the 3D board needs one: the board is handed its players'
// colours as the page writes them — a design token (`var(--ra-own)`), an
// `oklch()`, a hex — and three.js reads none but the last. The browser resolves
// it, under `scope` (so a token defined there resolves), and one pixel drawn in
// it gives the sRGB the isometric board would have shown.

import { Color } from "three";

const resolved = new Map<string, Color>();
let canvas: HTMLCanvasElement | null = null;

export function cssColour(scope: Element, css: string): Color {
    const known = resolved.get(css);
    if (known) return known;
    const probe = document.createElement("span");
    probe.style.color = css;
    scope.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    canvas ??= document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = computed;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    // As written, not converted to linear: the solid shader works in sRGB, as the sprites did.
    const colour = new Color(r / 255, g / 255, b / 255);
    resolved.set(css, colour);
    return colour;
}
