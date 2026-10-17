// The small shapes and the lines of text the 3D board's flat marks are drawn
// from (docs/realm-arena-3d.md): a solid block a bar or a ribbon is cut from,
// a disc, text outlined to read on the map. Each is drawn once into a
// `CanvasAtlas` (billboards.ts) in white, for a `Billboards` to tint, and
// sized in the isometric board's units, so the numbers the isometric board's
// CSS gives them carry over.

import { Color } from "three";
import { cssColour } from "./cssColour";
import type { CanvasAtlas, TexRect } from "./billboards";

/** The colours and the typeface the board draws its flat marks in, resolved once from the design tokens the isometric board's CSS draws them with. */
export interface BoardLook {
    /** The typeface (`--ag-font`), as a canvas font family. */
    font: string;
    /** The dark ground of the odds and the cover shields (`--ra-night`), and the gold on it (`--ag-gold`). */
    night: Color;
    gold: Color;
    /** A lined-up move's path and a chosen figure's ring (`--ag-on-dark`). */
    onDark: Color;
    /** The ring round a figure aimed at or a watcher a move would set off (`--ag-danger`), and round a squad still sealed (`--ra-oxblood`). */
    danger: Color;
    oxblood: Color;
    /** An HP bar's dark edge and what a blow would take off it, and the pale chip and what a heal would give (`--ra-hp-dark`, `--ra-hp-light`). */
    hpDark: Color;
    hpLight: Color;
}

/** The colours a ring is drawn in (`rings3d.ts`). */
export type RingColours = Pick<BoardLook, "onDark" | "gold" | "danger" | "oxblood">;

/** The look under `scope`, where the game's tokens (`.ag-game--realmarena`) resolve. */
export function boardLook(scope: Element): BoardLook {
    const token = (name: string) => cssColour(scope, `var(${name})`);
    const font = getComputedStyle(scope).getPropertyValue("--ag-font").trim() || getComputedStyle(scope).fontFamily;
    return {
        font, night: token("--ra-night"), gold: token("--ag-gold"), onDark: token("--ag-on-dark"), danger: token("--ag-danger"), oxblood: token("--ra-oxblood"),
        hpDark: token("--ra-hp-dark"), hpLight: token("--ra-hp-light"),
    };
}

/** A colour as the canvas writes it, at `alpha`: what `color-mix(in oklch, colour N%, transparent)` is. */
export const rgba = (colour: Color, alpha = 1): string => `rgba(${Math.round(colour.r * 255)}, ${Math.round(colour.g * 255)}, ${Math.round(colour.b * 255)}, ${alpha})`;

/** Texels of margin kept round a block so that a texel is never blended with the clear texels beside it. */
const MARGIN = 0.25;

/** The block of white as the atlas has it, drawn if it isn't yet. */
const solidBlock = (atlas: CanvasAtlas): TexRect => atlas.rect("solid", 2, 2, context => {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 2, 2);
});

/** A block of white to cut a bar or a ribbon from, stretched to any size. */
export function solidRect(atlas: CanvasAtlas): TexRect {
    const rect = solidBlock(atlas);
    const margin = MARGIN * atlas.scale;
    return { x: rect.x + margin, y: rect.y + margin, width: rect.width - 2 * margin, height: rect.height - 2 * margin };
}

/** The proportion of a disc's box it fills across: show a disc `d` across in a quad `d * DISC_BOX` wide. */
export const DISC_BOX = 1.2;

/** A white disc, a unit radius in a box a fifth wider than it (`DISC_BOX`). */
export function discRect(atlas: CanvasAtlas): TexRect {
    return atlas.rect("disc", 2 * DISC_BOX, 2 * DISC_BOX, context => {
        context.fillStyle = "#fff";
        context.beginPath();
        context.arc(DISC_BOX, DISC_BOX, 1, 0, 2 * Math.PI);
        context.fill();
    });
}

/**
 * Text is drawn in the canvas this many times larger than its size in board
 * units, and scaled down: a font only a few pixels high is one a browser may
 * round or lay out at a size of its own, whatever scale the context is at.
 */
const TEXT_SCALE = 10;

/** A line of text, in the weight and size (board units) the isometric board's CSS gives it. */
export interface TextStyle { family: string; weight: number; size: number }

const fontOf = ({ family, weight, size }: TextStyle) => `${weight} ${size * TEXT_SCALE}px ${family}`;

/** How wide `text` is, in board units. */
export const textWidth = (atlas: CanvasAtlas, text: string, style: TextStyle): number => atlas.measure(text, fontOf(style)) / TEXT_SCALE;

/**
 * Draws `text` at (`x`, `y`) in board units, centred across, on `baseline`.
 * Given `outline`, stroked that wide in that colour first (`paint-order:
 * stroke`) so it reads over whatever colour is under it, with corners joined
 * as `join` (a canvas's own default, a miter, as an SVG's is).
 */
export function drawText(
    context: CanvasRenderingContext2D, text: string, x: number, y: number, style: TextStyle, fill: string,
    { baseline = "alphabetic", outline }: { baseline?: CanvasTextBaseline; outline?: { colour: string; width: number; join?: CanvasLineJoin } } = {},
): void {
    context.save();
    context.scale(1 / TEXT_SCALE, 1 / TEXT_SCALE);
    context.font = fontOf(style);
    context.textAlign = "center";
    context.textBaseline = baseline;
    if (outline) {
        context.strokeStyle = outline.colour;
        context.lineWidth = outline.width * TEXT_SCALE;
        if (outline.join) context.lineJoin = outline.join;
        context.strokeText(text, x * TEXT_SCALE, y * TEXT_SCALE);
    }
    context.fillStyle = fill;
    context.fillText(text, x * TEXT_SCALE, y * TEXT_SCALE);
    context.restore();
}

/**
 * Calls `then` once `font` (a canvas font, e.g. `800 16px Bricolage Grotesque`)
 * has loaded, or has failed to: text drawn before then would be drawn in the
 * typeface that stands in for it, for good. Answers whether it will: a font
 * already loaded has nothing to wait for, and nor has a page without the font
 * API, which draws in what it has.
 */
export function whenFontReady(font: string, then: () => void): boolean {
    if (typeof document === "undefined" || !document.fonts || document.fonts.check(font)) return false;
    document.fonts.load(font).then(then, then);
    return true;
}

/**
 * Lays something out that draws into `atlas` as it goes, again if the atlas
 * filled and began afresh part-way: what was laid before that holds
 * rectangles that no longer show what they did. Anything it draws is kept
 * the second time, so the second pass is the last unless it needs more than
 * a whole atlas.
 */
export function layStable(atlas: CanvasAtlas, lay: () => void): void {
    for (let pass = 0; pass < 2; pass++) {
        const mark = solidBlock(atlas);
        lay();
        if (solidBlock(atlas) === mark) return;
    }
}
