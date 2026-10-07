'use client'
import React, { useRef } from 'react';
import { ISO_HALF_HEIGHT, ISO_HALF_WIDTH, type Point } from '@/utils/ui/isometric';
import type { Square } from '@/utils/games/battlefield/terrain';
import { BURST_ART, EFFECT_ART, MISSILE_ART, SLASH_ART, type Missile } from '@/games/RealmArena/art';
import { burstAt, flightAt, hitTextAt, slashAt, type BattleCue, type BurstCue, type FlightCue, type FxPoints, type SlashCue, type TextCue } from '@/games/RealmArena/ui';
import { SpriteUse } from './RealmArenaTerrain';
import { usePlaybackFrame } from '@/utils/hooks/usePlayback';
import { usePrefersReducedMotion } from '@/utils/hooks/usePrefersReducedMotion';

/** The hit text, in board units: the number's middle above the point it's given, the label under it, and a mark beside the number. */
const VALUE_RISE = 4;
const LABEL_DROP = 3.6;
const MARK_SIZE = 3.4;
const MARK_OFFSET = 5.4;
/** How much further out each character past a number's two ("−3") pushes a mark, so one beside a word — "Hunker down" — clears it: half a character's width. */
const MARK_PER_CHAR = 1.6;
/**
 * How much higher each lane of hit text stands (`TextCue.lane`): clear of the
 * number and the label under it on the lane below, with room for that one to
 * rise as it fades.
 */
const LANE_RISE = 9;
/** A strike's slash, across the figure it lands on. */
const SLASH_SIZE = 14;

/**
 * How each missile is drawn (§26.1), in board units: how big it is. A flask or
 * a pot tumbles end over end; anything else points the way it goes. (How high
 * its arc rises is `FLIGHT_ARC`, in `ui.ts`, with the rest of where it is.)
 */
const FLIGHT: Readonly<Record<Missile, { size: number; tumbles?: true }>> = {
    arrow: { size: 12 },
    bolt: { size: 10 },
    fireball: { size: 14 },
    fireFlask: { size: 7, tumbles: true },
    thunderFlask: { size: 7, tumbles: true },
    smokePot: { size: 7, tumbles: true },
    acid: { size: 10 },
};
/** How fast a flask or a pot turns over, in degrees a millisecond. */
const TUMBLE = 0.9;

interface RealmArenaFxProps {
    /** The board's id, which its art is defined under. */
    id: string;
    cues: readonly BattleCue[];
    /** Where a cue on a square goes, at the square's height and the view's turn. */
    at: (square: Square) => FxPoints;
}

/** `scale` about the point (`cx`, `cy`) rather than about the origin, as a transform. */
const scaleAbout = (cx: number, cy: number, scale: number) => `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`;

function HitText({ id, cue, over }: { id: string; cue: TextCue; over: Point }) {
    const still = usePrefersReducedMotion();
    const rising = useRef<SVGGElement>(null);
    const popping = useRef<SVGGElement>(null);
    const { x } = over;
    const y = over.y - (cue.lane ?? 0) * LANE_RISE;
    const middle = y - VALUE_RISE;
    // The attributes are the frame loop's alone: it draws them before the first
    // paint, and a render never puts them back.
    usePlaybackFrame(ms => {
        const frame = hitTextAt(cue, ms, still);
        rising.current?.setAttribute('opacity', String(frame.opacity));
        rising.current?.setAttribute('transform', `translate(0 ${frame.rise})`);
        popping.current?.setAttribute('transform', scaleAbout(x, middle, frame.scale));
    });
    return (
        <g ref={rising} className={`ag-ra-hit ag-ra-hit--${cue.tone}`}>
            <g ref={popping}>
                <text className="ag-ra-hit-value" x={x} y={middle}>{cue.value}</text>
                {cue.label && <text className="ag-ra-hit-label" x={x} y={middle + LABEL_DROP}>{cue.label}</text>}
                {cue.mark && <SpriteUse className="ag-ra-figure-mark" id={id} sprite={EFFECT_ART[cue.mark]} x={x + MARK_OFFSET + Math.max(0, cue.value.length - 2) * MARK_PER_CHAR} y={middle} size={MARK_SIZE} />}
            </g>
        </g>
    );
}

/** A burst over the square or the 3×3 it went off on, its foot along the area's front corner. */
function Burst({ id, cue, ground }: { id: string; cue: BurstCue; ground: Point }) {
    const flaring = useRef<SVGGElement>(null);
    const across = 2 * cue.radius + 1;
    const sprite = BURST_ART[cue.burst];
    const width = across * 2 * ISO_HALF_WIDTH;
    const height = width * sprite.height / sprite.width;
    const middle = ground.y + across * ISO_HALF_HEIGHT - height / 2;
    usePlaybackFrame(ms => {
        const frame = burstAt(cue, ms);
        flaring.current?.setAttribute('opacity', String(frame.opacity));
        flaring.current?.setAttribute('transform', scaleAbout(ground.x, middle, frame.scale));
    });
    return (
        <g ref={flaring} className={`ag-ra-burst ag-ra-burst--${cue.burst}`}>
            <SpriteUse className="ag-ra-burst-art" id={id} sprite={sprite} x={ground.x} y={middle} size={width} height={height} />
        </g>
    );
}

/** A strike's slash, wiped across the figure it lands on. */
function Slash({ id, cue, body }: { id: string; cue: SlashCue; body: Point }) {
    const wiping = useRef<SVGGElement>(null);
    usePlaybackFrame(ms => {
        const frame = slashAt(cue, ms);
        wiping.current?.setAttribute('opacity', String(frame.opacity));
        wiping.current?.setAttribute('transform', `translate(${frame.dx} ${frame.dy}) ${scaleAbout(body.x, body.y, frame.scale)}`);
    });
    return (
        <g ref={wiping} className="ag-ra-slash">
            <SpriteUse className="ag-ra-slash-art" id={id} sprite={SLASH_ART} x={body.x} y={body.y} size={SLASH_SIZE} />
        </g>
    );
}

/** A missile where it is now: pointing the way it flies, its front on the point, or tumbling about its middle. Hidden before it's loosed and once it's gone. */
function Flight({ id, cue, at }: { id: string; cue: FlightCue; at: RealmArenaFxProps['at'] }) {
    const flying = useRef<SVGGElement>(null);
    const { size, tumbles } = FLIGHT[cue.missile];
    usePlaybackFrame(ms => {
        const group = flying.current;
        if (!group) return;
        const now = flightAt(cue, at, ms);
        group.setAttribute('visibility', now ? 'visible' : 'hidden');
        if (!now) return;
        const turn = tumbles ? (ms - cue.start) * TUMBLE : now.heading;
        group.setAttribute('opacity', String(now.opacity));
        group.setAttribute('transform', `translate(${now.point.x} ${now.point.y}) rotate(${turn}) scale(${now.scale})`);
    });
    return (
        <g ref={flying} className="ag-ra-flight">
            <SpriteUse className="ag-ra-flight-art" id={id} sprite={MISSILE_ART[cue.missile]} x={tumbles ? 0 : -size / 2} y={0} size={size} />
        </g>
    );
}

/**
 * What an action did, played over the battlefield (docs/games/realm-arena.md
 * §26): hit text, bursts, slashes and the missiles in flight, drawn above the
 * figures. `battleCues` worked out when each part starts and how long it lasts.
 *
 * All of it moves on the playback's one clock (docs/isometric-animations.md
 * §4): each piece draws itself from the time `usePlaybackFrame` hands it, by
 * setting its own SVG attributes through a ref — no render a frame, and nothing
 * keyframed in the stylesheet. So a pause is one flag on the clock, a skip lands
 * everything at once, and nothing drifts against the walkers the board draws on
 * the same clock. The pure functions of time — where a missile is, how far a
 * text has risen — are `ui.ts`'s.
 *
 * This is drawn in an overlay SVG the board stacks over its own, with the same
 * viewBox, inside the same zoom: it zooms, pans and turns with the board, but a
 * frame of it repaints only this, not the board's hundreds of sprites. A fall,
 * a scorch and a walk are the board's, which draws the figure and the ground, and
 * a wall has to hide them. With reduced motion the text appears where it
 * happened and fades; nothing flies, bursts or slashes. Nothing here can be
 * tapped, so the board goes on working underneath while it plays.
 *
 * Keyed by its playback, so the next one starts it over and cuts this one short.
 */
export default function RealmArenaFx({ id, cues, at }: RealmArenaFxProps) {
    const still = usePrefersReducedMotion();
    return (
        <g className="ag-ra-fx" aria-hidden="true">
            {cues.map((cue, index) => {
                switch (cue.kind) {
                    case 'text': return <HitText key={index} id={id} cue={cue} over={at(cue.square).head} />;
                    case 'burst': return still ? null : <Burst key={index} id={id} cue={cue} ground={at(cue.at).ground} />;
                    case 'slash': return still ? null : <Slash key={index} id={id} cue={cue} body={at(cue.square).body} />;
                    case 'flight': return still ? null : <Flight key={index} id={id} cue={cue} at={at} />;
                    // A fall, a scorch and a walk are the board's, which draws the figure and the ground.
                    default: return null;
                }
            })}
        </g>
    );
}
