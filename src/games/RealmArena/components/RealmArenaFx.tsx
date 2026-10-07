'use client'
import React, { useEffect, useState } from 'react';
import { ISO_HALF_HEIGHT, ISO_HALF_WIDTH, type Point } from '@/utils/ui/isometric';
import type { Square } from '@/utils/games/battlefield/terrain';
import { BURST_ART, EFFECT_ART, MISSILE_ART, SLASH_ART, type Missile } from '@/games/RealmArena/art';
import type { BattleCue, BurstCue, FlightCue, SlashCue, TextCue } from '@/games/RealmArena/ui';
import { SpriteUse } from './RealmArenaTerrain';
import { usePrefersReducedMotion } from '@/utils/hooks/usePrefersReducedMotion';

/** The hit text, in board units: the number's middle above the point it's given, the label under it, and a mark beside the number. */
const VALUE_RISE = 4;
const LABEL_DROP = 3.6;
const MARK_SIZE = 3.4;
const MARK_OFFSET = 5.4;
/** A strike's slash, across the figure it lands on. */
const SLASH_SIZE = 14;

/**
 * How each missile flies (§26.1), in board units: how high its arc rises as
 * a share of how far it goes, and how long it's drawn. An arrow on a shallow
 * arc, a bolt in a straight line, a gobbet of acid on a lob, a fireball or a throw on a high one. A
 * flask or a pot tumbles end over end; anything else points the way it goes.
 */
const FLIGHT: Readonly<Record<Missile, { arc: number; size: number; tumbles?: true }>> = {
    arrow: { arc: 0.1, size: 12 },
    bolt: { arc: 0, size: 10 },
    fireball: { arc: 0.3, size: 14 },
    fireFlask: { arc: 0.3, size: 7, tumbles: true },
    thunderFlask: { arc: 0.3, size: 7, tumbles: true },
    smokePot: { arc: 0.3, size: 7, tumbles: true },
    acid: { arc: 0.2, size: 10 },
};
/** How fast a flask or a pot turns over, in degrees a millisecond. */
const TUMBLE = 0.9;
/** How far a graze turns a shot, in degrees, and how fast it glances on, as a share of the speed it flew at. */
const GLANCE_TURN = 40;
const GLANCE_RUN = 0.5;
/** How far over the head a miss goes, so it flies past the figure rather than through it. */
const MISS_CLEAR = 3;
/** How much bigger a bolt flares where it hits as it fades. */
const BOLT_FLARE = 1.5;

/** Where on a square the visuals go: its ground, the middle of a figure standing there, and the top of that figure. */
export interface FxPoints {
    ground: Point;
    body: Point;
    head: Point;
}

interface RealmArenaFxProps {
    /** The board's id, which its art is defined under. */
    id: string;
    cues: readonly BattleCue[];
    /** Where a cue on a square goes, at the square's height and the view's turn. */
    at: (square: Square) => FxPoints;
}

/** Milliseconds since it started, a frame at a time, until `until`: what the flights are drawn at, and the board's walkers. */
export function useElapsed(until: number): number {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (until <= 0) return;
        const began = performance.now();
        let frame = 0;
        const tick = (now: number) => {
            const ms = now - began;
            setElapsed(ms);
            if (ms < until) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [until]);
    return elapsed;
}

/** A point `u` along the curve from `a` through `c` to `b`, and the way it's heading there — carried on past `b` for `u` over 1. */
function along(a: Point, c: Point, b: Point, u: number): { point: Point; heading: number } {
    const v = 1 - u;
    const point = { x: v * v * a.x + 2 * u * v * c.x + u * u * b.x, y: v * v * a.y + 2 * u * v * c.y + u * u * b.y };
    const dx = 2 * v * (c.x - a.x) + 2 * u * (b.x - c.x), dy = 2 * v * (c.y - a.y) + 2 * u * (b.y - c.y);
    return { point, heading: Math.atan2(dy, dx) * 180 / Math.PI };
}

/**
 * Where a missile is `ms` into its flight, which way it points and how
 * clearly it's seen, or null once it's gone. It flies an arc from `from` to
 * its target, and then, with time left: an arrow stays stuck there and
 * fades; a bolt flares and fades; a graze glances off, turned upward; and a
 * miss, aimed just over the head, flies on past and comes down beyond.
 */
function flightAt(cue: FlightCue, at: RealmArenaFxProps['at'], ms: number): { point: Point; heading: number; opacity: number; scale: number } | null {
    if (ms < 0 || ms > cue.length) return null;
    const from = at(cue.from).body;
    const target = at(cue.to);
    const to = cue.result === 'landed' ? target.ground
        : cue.result === 'miss' ? { x: target.head.x, y: target.head.y - MISS_CLEAR }
        : target.body;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const rise = 2 * FLIGHT[cue.missile].arc * distance;
    const control = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - rise };
    const flying = ms <= cue.land;
    const u = ms / cue.land;
    if (flying || cue.result === 'miss') {
        const { point, heading } = along(from, control, to, u);
        return { point, heading, opacity: flying ? 1 : fade(ms, cue), scale: 1 };
    }
    const end = along(from, control, to, 1);
    const after = fade(ms, cue);
    if (cue.result === 'graze') {
        // Turned up, whichever way it was going.
        const heading = end.heading + (Math.cos(end.heading * Math.PI / 180) >= 0 ? -GLANCE_TURN : GLANCE_TURN);
        const run = GLANCE_RUN * (u - 1) * distance;
        const turned = heading * Math.PI / 180;
        return { point: { x: end.point.x + run * Math.cos(turned), y: end.point.y + run * Math.sin(turned) }, heading, opacity: after, scale: 1 };
    }
    return { ...end, opacity: after, scale: cue.missile === 'bolt' ? 1 + BOLT_FLARE * (1 - after) : 1 };
}

/** How much of a shot is left once it's there: all of it as it arrives, none by the end of its cue. */
function fade(ms: number, cue: FlightCue): number {
    return Math.max(0, 1 - (ms - cue.land) / Math.max(1, cue.length - cue.land));
}

/** A cue's timing as CSS animation: what the keyframed cues — text, a burst, a slash, and the board's fall and blast — are timed by. */
export const cueTiming = ({ start, length }: BattleCue): React.CSSProperties => ({ animationDelay: `${start}ms`, animationDuration: `${length}ms` });

function HitText({ id, cue, over }: { id: string; cue: TextCue; over: Point }) {
    const { x, y } = over;
    return (
        <g className={`ag-ra-hit ag-ra-hit--${cue.tone}`} style={cueTiming(cue)}>
            <text className="ag-ra-hit-value" x={x} y={y - VALUE_RISE}>{cue.value}</text>
            {cue.label && <text className="ag-ra-hit-label" x={x} y={y - VALUE_RISE + LABEL_DROP}>{cue.label}</text>}
            {cue.mark && <SpriteUse className="ag-ra-figure-mark" id={id} sprite={EFFECT_ART[cue.mark]} x={x + MARK_OFFSET} y={y - VALUE_RISE} size={MARK_SIZE} />}
        </g>
    );
}

/** A burst over the square or the 3×3 it went off on, its foot along the area's front corner. */
function Burst({ id, cue, ground }: { id: string; cue: BurstCue; ground: Point }) {
    const across = 2 * cue.radius + 1;
    const sprite = BURST_ART[cue.burst];
    const width = across * 2 * ISO_HALF_WIDTH;
    const height = width * sprite.height / sprite.width;
    return (
        <g className={`ag-ra-burst ag-ra-burst--${cue.burst}`} style={cueTiming(cue)}>
            <SpriteUse className="ag-ra-burst-art" id={id} sprite={sprite} x={ground.x} y={ground.y + across * ISO_HALF_HEIGHT - height / 2} size={width} height={height} />
        </g>
    );
}

function Slash({ id, cue, body }: { id: string; cue: SlashCue; body: Point }) {
    return (
        <g className="ag-ra-slash" style={cueTiming(cue)}>
            <SpriteUse className="ag-ra-slash-art" id={id} sprite={SLASH_ART} x={body.x} y={body.y} size={SLASH_SIZE} />
        </g>
    );
}

/** A missile where it is now: pointing the way it flies, its front on the point, or tumbling about its middle. */
function Flight({ id, cue, at, ms }: { id: string; cue: FlightCue; at: RealmArenaFxProps['at']; ms: number }) {
    const now = flightAt(cue, at, ms);
    if (!now) return null;
    const { size, tumbles } = FLIGHT[cue.missile];
    const turn = tumbles ? ms * TUMBLE : now.heading;
    return (
        <g className="ag-ra-flight" opacity={now.opacity} transform={`translate(${now.point.x} ${now.point.y}) rotate(${turn}) scale(${now.scale})`}>
            <SpriteUse className="ag-ra-flight-art" id={id} sprite={MISSILE_ART[cue.missile]} x={tumbles ? 0 : -size / 2} y={0} size={size} />
        </g>
    );
}

/**
 * Everything flying at once, moved a frame at a time by its own clock — so
 * only this re-renders each frame, not the keyframed cues beside it — for as
 * long as the last of them lasts.
 */
function Flights({ id, flights, at }: { id: string; flights: readonly FlightCue[]; at: RealmArenaFxProps['at'] }) {
    const ms = useElapsed(Math.max(0, ...flights.map(cue => cue.start + cue.length)));
    return flights.map((cue, index) => <Flight key={index} id={id} cue={cue} at={at} ms={ms - cue.start} />);
}

/**
 * What an action did, played over the battlefield (docs/games/realm-arena.md
 * §26): drawn in the board's own SVG, above the figures, so it zooms, pans and
 * turns with the board. `battleCues` worked out when each part starts and how
 * long it lasts.
 *
 * What flies — an arrow, a bolt, a fireball, a flask — is moved a frame at a
 * time along its arc, turned to face the way it's going. What stays put —
 * hit text rising and fading, a burst, a slash — is CSS keyframes
 * (`ag-ra-hit`, `ag-ra-burst`, `ag-ra-slash`) timed by its cue. A walk is the
 * board's, which draws the figure along its path. With reduced
 * motion, nothing flies, bursts or slashes: only the text plays — the
 * flights aren't drawn, and the stylesheet hides the bursts and the slashes. Nothing here
 * can be tapped, so the board goes on working underneath while it plays.
 *
 * Keyed by its playback, so the next one starts it over and cuts this one short.
 */
export default function RealmArenaFx({ id, cues, at }: RealmArenaFxProps) {
    const still = usePrefersReducedMotion();
    const flights = cues.filter((cue): cue is FlightCue => cue.kind === 'flight');
    return (
        <g className="ag-ra-fx" aria-hidden="true">
            {cues.map((cue, index) => {
                switch (cue.kind) {
                    case 'text': return <HitText key={index} id={id} cue={cue} over={at(cue.square).head} />;
                    case 'burst': return <Burst key={index} id={id} cue={cue} ground={at(cue.at).ground} />;
                    case 'slash': return <Slash key={index} id={id} cue={cue} body={at(cue.square).body} />;
                    // A flight is drawn below; a fall, a scorch and a walk are the board's, which draws the figure and the ground.
                    default: return null;
                }
            })}
            {!still && flights.length > 0 && <Flights id={id} flights={flights} at={at} />}
        </g>
    );
}
