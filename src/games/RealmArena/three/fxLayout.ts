// Where the pieces of a battle effect go, for the 3D board to draw (fx3d.ts):
// the hit text's value, label and mark; a missile's quad; a burst's. All of it
// in the isometric board's units across the frame (right, and down), from the
// point a quad hangs from, laid out exactly as RealmArenaFx lays the same pieces
// out in its SVG — the same constants (ui.ts), the same offsets — so the two
// boards draw one effect alike. Pure: no three.js objects, so it's tested
// without a GPU.

import { ISO_HALF_HEIGHT, ISO_HALF_WIDTH, type Point } from "@/utils/ui/isometric";
import type { Missile, Sprite } from "@/games/RealmArena/art";
import {
    fxPointsAt, FLIGHT, HIT_LABEL_DROP, HIT_LANE_RISE, HIT_MARK_GAP, HIT_MARK_SIZE, HIT_VALUE_RISE, SMOKE_SIZE, TUMBLE, type FlightFrame, type HitTextFrame, type TextCue,
} from "@/games/RealmArena/ui";

/** Where a figure's body and head are, from the middle of the square's top it stands on: a slash lands on the body, and hit text hangs from the head. */
export const { body: BODY, head: HEAD } = fxPointsAt({ x: 0, y: 0 });

/** Where the pieces of one hit text are, from the middle of its square's top. */
export interface HitTextLayout {
    /** How much bigger than their own size they are drawn: the pop of a blow that lands. */
    scale: number;
    /** The middle of the big text, and of the small text under it and the mark beside it, if it has them. */
    value: Point;
    label: Point | null;
    mark: Point | null;
}

/**
 * Hit text `frame` into its cue, given how wide its big text is: hung from the
 * head, a lane higher for each lane (`TextCue.lane`), risen by `frame.rise`.
 * The pop scales the three pieces about the middle of the big text, where it
 * was before it rose, so the label and the mark stand further off while it's
 * big — and the rise is not scaled.
 */
export function hitTextLayout(cue: Pick<TextCue, "lane" | "label" | "mark">, frame: HitTextFrame, valueWidth: number): HitTextLayout {
    const middle = HEAD.y - (cue.lane ?? 0) * HIT_LANE_RISE - HIT_VALUE_RISE + frame.rise;
    const { scale } = frame;
    return {
        scale,
        value: { x: HEAD.x, y: middle },
        label: cue.label ? { x: HEAD.x, y: middle + HIT_LABEL_DROP * scale } : null,
        mark: cue.mark ? { x: HEAD.x + (valueWidth / 2 + HIT_MARK_GAP + HIT_MARK_SIZE / 2) * scale, y: middle } : null,
    };
}

/** One missile's quad: where its middle is from the point it's measured from, how it's turned (clockwise degrees), how big it's drawn, and how clearly. */
export interface FlightPlace {
    x: number;
    y: number;
    rotate: number;
    size: number;
    scale: number;
    opacity: number;
}

/**
 * A missile `into` its cue, where `frame` (`flightAt`) says its point is, measured from `anchor`. One that tumbles
 * turns about its middle, which is on the point; any other points the way it
 * flies with its front on the point, so its middle is half its size behind.
 */
export function flightPlace(missile: Missile, frame: FlightFrame, into: number, anchor: Point): FlightPlace {
    const { size, tumbles } = FLIGHT[missile];
    const x = frame.point.x - anchor.x, y = frame.point.y - anchor.y;
    const common = { size, scale: frame.scale, opacity: frame.opacity };
    if (tumbles) return { ...common, x, y, rotate: into * TUMBLE };
    const heading = frame.heading * Math.PI / 180, back = size / 2 * frame.scale;
    return { ...common, x: x - back * Math.cos(heading), y: y - back * Math.sin(heading), rotate: frame.heading };
}

/**
 * A burst's quad over the square or the 3×3 it went off on (`radius` squares
 * each way): its art stretched over the area's width, its foot along the area's
 * front corner. `y` is its middle from the area's middle, down.
 */
export function burstBox(sprite: Sprite, radius: number): { y: number; width: number; height: number } {
    const across = 2 * radius + 1;
    const width = across * 2 * ISO_HALF_WIDTH;
    const height = width * sprite.height / sprite.width;
    return { y: across * ISO_HALF_HEIGHT - height / 2, width, height };
}

/** A puff of a smoke pot's cloud: `SMOKE_SIZE` across, its foot just in front of its square's middle. `y` is its middle from the square's, down. */
export const SMOKE_PUFF = { width: SMOKE_SIZE, y: ISO_HALF_HEIGHT - SMOKE_SIZE / 2 };
